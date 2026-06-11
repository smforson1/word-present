/**
 * Offline Speech-to-Text Engine
 * Uses @xenova/transformers (Whisper base.en) — pure WASM, zero internet at runtime.
 *
 * Audio input: Float32Array PCM at 16kHz, decoded in the renderer where AudioContext
 * is available, then passed here as a plain number[] over IPC.
 */

import { app } from 'electron';
import { join } from 'path';
import * as fs from 'fs';

// ── Model cache ───────────────────────────────────────────────────────────────
const MODEL_CACHE_DIR = join(app.getPath('userData'), 'whisper-models');
if (!fs.existsSync(MODEL_CACHE_DIR)) {
  fs.mkdirSync(MODEL_CACHE_DIR, { recursive: true });
}
process.env.XENOVA_CACHE_DIR = MODEL_CACHE_DIR;

// ── Pipeline state ────────────────────────────────────────────────────────────
let pipeline: any = null;
let pipelineLoading = false;
let pipelineReady = false;
const pendingCallbacks: Array<() => void> = [];

export type TranscribeProgress = (
  status: 'downloading' | 'loading' | 'ready' | 'error',
  detail?: string
) => void;

export async function initSpeechEngine(onProgress: TranscribeProgress): Promise<boolean> {
  if (pipelineReady) return true;
  if (pipelineLoading) {
    return new Promise((resolve) => {
      pendingCallbacks.push(() => resolve(pipelineReady));
    });
  }

  pipelineLoading = true;

  try {
    onProgress('downloading', 'Downloading Whisper base.en model (~290MB, one-time)…');

    const { pipeline: createPipeline, env } = await import('@xenova/transformers');
    env.cacheDir = MODEL_CACHE_DIR;
    env.allowLocalModels = true;

    pipeline = await createPipeline(
      'automatic-speech-recognition',
      'Xenova/whisper-base.en',
      {
        progress_callback: (progress: any) => {
          if (progress.status === 'downloading') {
            const pct = progress.total
              ? Math.round((progress.loaded / progress.total) * 100)
              : 0;
            onProgress('downloading', `Downloading model: ${pct}%`);
          } else if (progress.status === 'loading') {
            onProgress('loading', 'Loading Whisper model into memory…');
          }
        },
      }
    );

    pipelineReady = true;
    onProgress('ready', 'Whisper base.en ready — fully offline, no internet required.');
  } catch (err: any) {
    onProgress('error', `Failed to load Whisper model: ${err?.message ?? err}`);
    pipelineReady = false;
    pipelineLoading = false;
    pendingCallbacks.forEach(cb => cb());
    pendingCallbacks.length = 0;
    return false;
  }

  pipelineLoading = false;
  pendingCallbacks.forEach(cb => cb());
  pendingCallbacks.length = 0;
  return true;
}

/**
 * Transcribe a PCM audio chunk.
 * @param pcmData  Int16-range samples (−32768…32767) at 16kHz mono, normalized to Float32 for Whisper
 */
export async function transcribeChunk(pcmData: number[]): Promise<string> {
  if (!pipelineReady || !pipeline) return '';
  if (!pcmData || pcmData.length < 1600) return ''; // at least 0.1s @ 16kHz

  try {
    // Normalize Int16-range values to Float32 [-1, 1] for Whisper
    const float32 = new Float32Array(pcmData.length);
    for (let i = 0; i < pcmData.length; i++) {
      float32[i] = Math.max(-1, Math.min(1, pcmData[i] / 32768));
    }

    const result = await pipeline(float32, {
      sampling_rate: 16000,
      task: 'transcribe',
      language: 'english',
      return_timestamps: false,
    });

    return (result?.text ?? '').trim();
  } catch (err) {
    console.error('[SpeechEngine] Whisper inference error:', err);
    return '';
  }
}

export function isSpeechEngineReady(): boolean {
  return pipelineReady;
}
