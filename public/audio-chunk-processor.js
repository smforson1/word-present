/**
 * AudioWorklet processor — captures raw PCM float32 at the AudioContext sample rate
 * and posts complete 4-second chunks to the main thread.
 *
 * Runs in the dedicated AudioWorkletGlobalScope thread (NOT the renderer main thread),
 * so heavy Float32Array accumulation here never stalls the UI or causes blank screens.
 */
class AudioChunkProcessor extends AudioWorkletProcessor {
  constructor () {
    super();
    // Pre-allocate a 5-second ring buffer (a little over 4s to avoid edge cases)
    this._sampleRate = 16000;           // set by options in AudioWorkletNode
    this._chunkSize  = 16000 * 4;       // 4 seconds
    this._buffer     = new Float32Array(this._sampleRate * 5);
    this._head       = 0;
    this._active     = true;

    // Allow the main thread to stop accumulation cleanly
    this.port.onmessage = (evt) => {
      if (evt.data === 'stop') this._active = false;
    };
  }

  /**
   * process() is called by the audio engine for every render quantum (128 frames).
   * Must return true to keep the node alive.
   */
  process (inputs /*, outputs, parameters */) {
    if (!this._active) return true;

    const channelData = inputs[0]?.[0];   // mono Float32Array of 128 samples
    if (!channelData || channelData.length === 0) return true;

    // Copy into pre-allocated ring buffer — zero GC pressure
    const remaining = this._buffer.length - this._head;
    if (channelData.length <= remaining) {
      this._buffer.set(channelData, this._head);
      this._head += channelData.length;
    } else {
      // Buffer nearly full (shouldn't happen with 5s capacity & 4s flush)
      this._head = 0;
      this._buffer.set(channelData, 0);
      this._head = channelData.length;
    }

    // When we have at least one full 4-second chunk, transfer it to the main thread
    if (this._head >= this._chunkSize) {
      const chunk = this._buffer.slice(0, this._head);  // copy
      this._head  = 0;                                   // reset
      // Transfer ownership of the underlying ArrayBuffer for zero-copy IPC
      this.port.postMessage({ type: 'chunk', data: chunk }, [chunk.buffer]);
    }

    return true;
  }
}

registerProcessor('audio-chunk-processor', AudioChunkProcessor);
