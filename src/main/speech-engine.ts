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
let currentModelName = 'Xenova/whisper-base.en';
const pendingCallbacks: Array<() => void> = [];

export type TranscribeProgress = (
  status: 'downloading' | 'loading' | 'ready' | 'error',
  detail?: string
) => void;

export async function initSpeechEngine(onProgress: TranscribeProgress, modelName?: string): Promise<boolean> {
  const targetModel = modelName || 'Xenova/whisper-base.en';

  if (pipelineReady && currentModelName === targetModel && pipeline) return true;

  // Unload previous pipeline if switching models
  if (currentModelName !== targetModel) {
    pipelineReady = false;
    pipeline = null;
    currentModelName = targetModel;
  }

  if (pipelineLoading) {
    return new Promise((resolve) => {
      pendingCallbacks.push(() => resolve(pipelineReady));
    });
  }

  pipelineLoading = true;

  try {
    const modelLabel = targetModel.replace('Xenova/whisper-', '');
    onProgress('downloading', `Downloading Whisper ${modelLabel} model (one-time)…`);

    const { pipeline: createPipeline, env } = await import('@xenova/transformers');
    env.cacheDir = MODEL_CACHE_DIR;
    env.allowLocalModels = true;

    pipeline = await createPipeline(
      'automatic-speech-recognition',
      targetModel,
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
    onProgress('ready', `Whisper ${modelLabel} ready — fully offline, no internet required.`);
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

    const isMultilingual = !currentModelName.endsWith('.en');
    const result = await pipeline(float32, {
      sampling_rate: 16000,
      task: 'transcribe',
      language: isMultilingual ? undefined : 'english',
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

/**
 * Scan Cache Directory for already downloaded models
 */
export function getDownloadedModels(): string[] {
  const modelsDir = join(MODEL_CACHE_DIR, 'models', 'Xenova');
  if (!fs.existsSync(modelsDir)) return [];

  try {
    const files = fs.readdirSync(modelsDir);
    return files.filter(f => {
      const p = join(modelsDir, f);
      if (fs.statSync(p).isDirectory()) {
        return fs.readdirSync(p).length > 0;
      }
      return false;
    }).map(f => `Xenova/${f}`);
  } catch (err) {
    console.error('[SpeechEngine] Failed to read cached models directory:', err);
    return [];
  }
}

/**
 * Safely purge local model files on disk
 */
export function deleteModelFiles(modelName: string): boolean {
  const parts = modelName.split('/');
  if (parts.length < 2) return false;

  const modelFolder = join(MODEL_CACHE_DIR, 'models', parts[0], parts[1]);
  if (!fs.existsSync(modelFolder)) return true;

  try {
    if (currentModelName === modelName) {
      pipeline = null;
      pipelineReady = false;
    }
    fs.rmSync(modelFolder, { recursive: true, force: true });
    console.log(`[SpeechEngine] Deleted model files for ${modelName}`);
    return true;
  } catch (err) {
    console.error(`[SpeechEngine] Failed to delete model files for ${modelName}:`, err);
    return false;
  }
}
