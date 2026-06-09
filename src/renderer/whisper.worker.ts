/**
 * Whisper Web Worker
 * Loads @xenova/transformers Whisper tiny.en in a Web Worker so it doesn't
 * block the UI thread. Receives decoded Float32Array PCM at 16kHz and returns
 * transcript text.
 *
 * Runs entirely in the renderer process — no IPC, no main process needed.
 * AudioContext for decoding is done on the main renderer thread before sending.
 */

import { pipeline, env } from '@xenova/transformers';

// Use the renderer's cache location
env.allowLocalModels = false; // always fetch from HuggingFace CDN on first use, then cached by browser
env.useBrowserCache = true;

let whisperPipeline: any = null;

async function loadPipeline(onProgress: (msg: string) => void) {
  if (whisperPipeline) return whisperPipeline;

  onProgress('Downloading Whisper model (~40MB, one-time)…');

  whisperPipeline = await pipeline(
    'automatic-speech-recognition',
    'Xenova/whisper-tiny.en',
    {
      progress_callback: (progress: any) => {
        if (progress.status === 'downloading') {
          const pct = progress.total
            ? Math.round((progress.loaded / progress.total) * 100)
            : 0;
          onProgress(`Downloading model: ${pct}%`);
        } else if (progress.status === 'loading') {
          onProgress('Loading model into memory…');
        }
      },
    }
  );

  return whisperPipeline;
}

// Handle messages from the main thread
self.addEventListener('message', async (event: MessageEvent) => {
  const { type, id, pcm } = event.data;

  if (type === 'init') {
    try {
      await loadPipeline((msg) => {
        self.postMessage({ type: 'progress', message: msg });
      });
      self.postMessage({ type: 'ready' });
    } catch (err: any) {
      self.postMessage({ type: 'error', message: err?.message ?? String(err) });
    }
    return;
  }

  if (type === 'transcribe') {
    try {
      const pipe = await loadPipeline(() => {});
      const float32 = new Float32Array(pcm);

      const result = await pipe(float32, {
        sampling_rate: 16000,
        task: 'transcribe',
        language: 'english',
        return_timestamps: false,
      });

      self.postMessage({ type: 'result', id, text: result?.text?.trim() ?? '' });
    } catch (err: any) {
      self.postMessage({ type: 'result', id, text: '', error: err?.message });
    }
  }
});
