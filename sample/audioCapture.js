/**
 * audioCapture.js — Renderer Process
 *
 * Captures microphone audio using the Web Audio API and feeds overlapping
 * chunks to the main process via IPC. Uses a ring buffer so no audio at
 * chunk boundaries is ever lost.
 *
 * Strategy:
 *   - Record in 6-second chunks
 *   - Each chunk overlaps the previous by 2 seconds
 *   - Audio is sent as raw 16-bit PCM at 16 kHz (what Whisper expects)
 */

const SAMPLE_RATE = 16000;       // Hz — Whisper requires 16 kHz
const CHUNK_SECONDS = 6;         // seconds per chunk sent to Whisper
const OVERLAP_SECONDS = 2;       // seconds of overlap between chunks
const CHUNK_SAMPLES = SAMPLE_RATE * CHUNK_SECONDS;
const OVERLAP_SAMPLES = SAMPLE_RATE * OVERLAP_SECONDS;
const STRIDE_SAMPLES = CHUNK_SAMPLES - OVERLAP_SAMPLES; // new audio per chunk

class AudioCapture {
  constructor({ onChunk, onError, onStatus }) {
    this.onChunk = onChunk;     // callback(Float32Array pcm, chunkIndex)
    this.onError = onError;     // callback(Error)
    this.onStatus = onStatus;   // callback(string)

    this.audioContext = null;
    this.mediaStream = null;
    this.sourceNode = null;
    this.processorNode = null;

    // Ring buffer: holds enough samples for one full chunk + one overlap
    this.ringBuffer = new Float32Array(CHUNK_SAMPLES * 2);
    this.writePos = 0;          // next position to write into ring buffer
    this.totalSamplesWritten = 0;
    this.chunkIndex = 0;
    this.isRunning = false;
  }

  async start() {
    try {
      this.onStatus('Requesting microphone access...');

      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: SAMPLE_RATE,
          channelCount: 1,          // mono — Whisper doesn't need stereo
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });

      // AudioContext resamples to our target rate automatically
      this.audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

      // ScriptProcessorNode gives us raw PCM samples in real time
      // Buffer size 4096 = ~256ms latency at 16kHz, acceptable for live sermons
      this.processorNode = this.audioContext.createScriptProcessor(4096, 1, 1);
      this.processorNode.onaudioprocess = (e) => this._onAudioProcess(e);

      this.sourceNode.connect(this.processorNode);
      this.processorNode.connect(this.audioContext.destination);

      this.isRunning = true;
      this.onStatus('Listening...');
    } catch (err) {
      this.onError(err);
    }
  }

  stop() {
    this.isRunning = false;
    if (this.processorNode) {
      this.processorNode.disconnect();
      this.processorNode = null;
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(t => t.stop());
      this.mediaStream = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    // Reset ring buffer state
    this.ringBuffer = new Float32Array(CHUNK_SAMPLES * 2);
    this.writePos = 0;
    this.totalSamplesWritten = 0;
    this.chunkIndex = 0;
    this.onStatus('Stopped.');
  }

  _onAudioProcess(event) {
    if (!this.isRunning) return;

    const inputData = event.inputBuffer.getChannelData(0); // Float32Array

    // Write incoming samples into the ring buffer
    for (let i = 0; i < inputData.length; i++) {
      this.ringBuffer[this.writePos % this.ringBuffer.length] = inputData[i];
      this.writePos++;
      this.totalSamplesWritten++;

      // Every STRIDE_SAMPLES new samples, emit a chunk
      if (
        this.totalSamplesWritten >= CHUNK_SAMPLES &&
        (this.totalSamplesWritten - CHUNK_SAMPLES) % STRIDE_SAMPLES === 0
      ) {
        this._emitChunk();
      }
    }
  }

  _emitChunk() {
    // Extract the last CHUNK_SAMPLES from the ring buffer in order
    const chunk = new Float32Array(CHUNK_SAMPLES);
    const startPos = this.writePos - CHUNK_SAMPLES;

    for (let i = 0; i < CHUNK_SAMPLES; i++) {
      const bufPos = (startPos + i + this.ringBuffer.length) % this.ringBuffer.length;
      chunk[i] = this.ringBuffer[bufPos];
    }

    // Convert Float32 [-1,1] to Int16 PCM [-32768,32767] for Whisper
    const pcm16 = float32ToInt16(chunk);

    this.onChunk(pcm16, this.chunkIndex);
    this.chunkIndex++;
  }
}

/**
 * Convert Float32Array audio samples to Int16Array PCM.
 * Whisper (and most audio pipelines) expect 16-bit signed integers.
 */
function float32ToInt16(float32Array) {
  const int16 = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    // Clamp to [-1, 1] then scale to int16 range
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    int16[i] = s < 0 ? s * 32768 : s * 32767;
  }
  return int16;
}

module.exports = { AudioCapture, SAMPLE_RATE, CHUNK_SECONDS, OVERLAP_SECONDS };
