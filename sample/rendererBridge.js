/**
 * rendererBridge.js — Renderer Process (Control Window)
 *
 * Connects the AudioCapture ring buffer to the Electron IPC channel,
 * and handles incoming transcript updates from the main process.
 *
 * Include this in your control window's HTML:
 *   <script src="rendererBridge.js"></script>
 *
 * Exposes a global `SermonApp` object with start/stop methods.
 */

const { ipcRenderer } = require('electron');
const { AudioCapture } = require('./audioCapture');

// ── DOM elements (adjust IDs to match your HTML) ──────────────────────────
const statusEl         = document.getElementById('status');
const transcriptEl     = document.getElementById('transcript');
const detectedVerseEl  = document.getElementById('detected-verse');
const startBtn         = document.getElementById('btn-start');
const stopBtn          = document.getElementById('btn-stop');
const projectBtn       = document.getElementById('btn-project');
const clearBtn         = document.getElementById('btn-clear');

// ── State ──────────────────────────────────────────────────────────────────
let currentDetectedVerse = null;

// ── Audio capture ──────────────────────────────────────────────────────────
const capture = new AudioCapture({
  onChunk: (pcm16, chunkIndex) => {
    // Send each audio chunk to main process — it forwards to Python Whisper
    ipcRenderer.send('audio:chunk', { pcm: pcm16, chunkIndex });
  },
  onError: (err) => {
    setStatus(`Microphone error: ${err.message}`, 'error');
  },
  onStatus: (msg) => {
    setStatus(msg);
  }
});

// ── IPC: receive events from main process ──────────────────────────────────

ipcRenderer.on('transcription:status', (event, { status, model }) => {
  const labels = {
    starting:  `Loading Whisper (${model})… first load takes ~10s`,
    listening: 'Listening...',
    stopped:   'Stopped.',
  };
  setStatus(labels[status] || status);

  if (status === 'listening') {
    startBtn.disabled = true;
    stopBtn.disabled = false;
  } else {
    startBtn.disabled = false;
    stopBtn.disabled = true;
  }
});

ipcRenderer.on('transcription:error', (event, { message }) => {
  setStatus(`Error: ${message}`, 'error');
});

ipcRenderer.on('transcript:update', (event, { newText, fullTranscript, recentText }) => {
  // Update the rolling transcript display
  if (transcriptEl) {
    transcriptEl.textContent = fullTranscript;
    // Auto-scroll to bottom
    transcriptEl.scrollTop = transcriptEl.scrollHeight;
  }

  // Trigger Bible quote detection on the recent text window
  if (newText && newText.trim()) {
    detectBibleQuote(recentText);
  }
});

// ── Bible quote detection (runs in renderer, matches against local bible.json) 
// Import your bible matcher here
// const { findVerse } = require('./bibleMatcher');

function detectBibleQuote(recentText) {
  // Replace this stub with your actual bible matcher call
  // const match = findVerse(recentText);
  // if (match && match.score > 0.75) showDetectedVerse(match);
  console.log('[Bible check]', recentText.slice(-80));
}

function showDetectedVerse(verse) {
  currentDetectedVerse = verse;
  if (detectedVerseEl) {
    detectedVerseEl.innerHTML = `
      <strong>${verse.reference}</strong>
      <p>${verse.text}</p>
      <span class="confidence">${Math.round(verse.score * 100)}% match</span>
    `;
    projectBtn.disabled = false;
  }
}

// ── Button handlers ────────────────────────────────────────────────────────

startBtn.addEventListener('click', async () => {
  startBtn.disabled = true;
  await capture.start();
  ipcRenderer.send('transcription:start');
});

stopBtn.addEventListener('click', () => {
  capture.stop();
  ipcRenderer.send('transcription:stop');
  stopBtn.disabled = true;
  startBtn.disabled = false;
});

projectBtn.addEventListener('click', () => {
  if (currentDetectedVerse) {
    ipcRenderer.send('verse:project', currentDetectedVerse);
  }
});

clearBtn.addEventListener('click', () => {
  ipcRenderer.send('verse:clear');
  currentDetectedVerse = null;
  if (detectedVerseEl) detectedVerseEl.innerHTML = '';
  projectBtn.disabled = true;
});

// ── Helpers ────────────────────────────────────────────────────────────────

function setStatus(msg, level = 'info') {
  if (statusEl) {
    statusEl.textContent = msg;
    statusEl.className = `status status--${level}`;
  }
  console.log(`[Status] ${msg}`);
}

window.SermonApp = { capture, showDetectedVerse };
