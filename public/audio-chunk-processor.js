/**
 * AudioWorklet processor — captures raw PCM float32 at the AudioContext native sample rate
 * and posts downsampled 16kHz chunks to the main thread.
 *
 * Runs in the dedicated AudioWorkletGlobalScope thread.
 */
class AudioChunkProcessor extends AudioWorkletProcessor {
  constructor () {
    super();
    // Query the native hardware sample rate of the AudioContext
    this._nativeSampleRate = sampleRate; // Global in AudioWorkletGlobalScope
    this._targetSampleRate = 16000;

    // Chunk size parameters in seconds
    this._chunkSeconds = 3;
    this._overlapSeconds = 1;

    // Chunk size in native samples
    this._chunkSize = this._nativeSampleRate * this._chunkSeconds;
    this._overlapSize = this._nativeSampleRate * this._overlapSeconds;

    this._chunkIndex = 0;
    // Buffer capacity to hold 10 seconds of native samples
    this._buffer = new Float32Array(this._nativeSampleRate * 10);
    this._head = 0;
    this._active = true;

    // Listen for updates to parameters from the main thread
    this.port.onmessage = (evt) => {
      if (evt.data === 'stop') this._active = false;
      if (evt.data && evt.data.type === 'set-chunk-size') {
        // evt.data.value is target samples at 16kHz (e.g. 48000 for 3 seconds)
        this._chunkSeconds = evt.data.value / 16000;
        this._overlapSeconds = this._chunkSeconds > 3 ? 2 : 1;

        this._chunkSize = this._nativeSampleRate * this._chunkSeconds;
        this._overlapSize = this._nativeSampleRate * this._overlapSeconds;
      }
    };
  }

  /**
   * process() is called by the audio engine for every render quantum (128 frames).
   */
  process (inputs) {
    if (!this._active) return true;

    const channelData = inputs[0]?.[0]; // mono Float32Array of 128 samples
    if (!channelData || channelData.length === 0) return true;

    // Copy incoming native samples into the ring buffer
    const remaining = this._buffer.length - this._head;
    if (channelData.length <= remaining) {
      this._buffer.set(channelData, this._head);
      this._head += channelData.length;
    } else {
      // Buffer full (safeguard)
      this._head = 0;
      this._buffer.set(channelData, 0);
      this._head = channelData.length;
    }

    // When we have accumulated enough native samples for a full chunk
    if (this._head >= this._chunkSize) {
      const nativeChunk = this._buffer.slice(0, this._head);

      // Downsample native chunk to 16000Hz mono using linear interpolation
      let resampledChunk;
      if (this._nativeSampleRate === this._targetSampleRate) {
        resampledChunk = nativeChunk;
      } else {
        const ratio = this._nativeSampleRate / this._targetSampleRate;
        const targetLength = Math.round(nativeChunk.length / ratio);
        resampledChunk = new Float32Array(targetLength);
        for (let i = 0; i < targetLength; i++) {
          const srcIndex = i * ratio;
          const indexLow = Math.floor(srcIndex);
          const indexHigh = Math.min(nativeChunk.length - 1, indexLow + 1);
          const weight = srcIndex - indexLow;
          resampledChunk[i] = nativeChunk[indexLow] * (1 - weight) + nativeChunk[indexHigh] * weight;
        }
      }

      // Post resampled 16kHz Float32 chunk to renderer main thread
      this.port.postMessage({
        type: 'chunk',
        data: resampledChunk,
        chunkIndex: this._chunkIndex
      }, [resampledChunk.buffer]);
      this._chunkIndex++;

      // Shift overlapping native samples to the beginning of the buffer
      const overlapStart = this._head - this._overlapSize;
      if (overlapStart > 0) {
        this._buffer.copyWithin(0, overlapStart, this._head);
        this._head = this._overlapSize;
      } else {
        this._head = 0;
      }
    }

    return true;
  }
}

registerProcessor('audio-chunk-processor', AudioChunkProcessor);
