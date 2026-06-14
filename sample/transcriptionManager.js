/**
 * transcriptionManager.js — Main Process
 *
 * Manages the full transcription pipeline:
 *   1. Spawns the Python Whisper sidecar as a child process
 *   2. Receives audio chunks from the renderer via IPC
 *   3. Forwards chunks to Python, receives transcripts back
 *   4. Stitches overlapping chunks using TranscriptStitcher
 *   5. Broadcasts clean transcript + new text to all windows via IPC
 *
 * Wire it up in main.js:
 *   const tm = new TranscriptionManager(mainWindow, projectorWindow);
 *   tm.init();
 */

const { ipcMain, BrowserWindow } = require('electron');
const { PythonShell } = require('python-shell');
const path = require('path');
const { TranscriptStitcher } = require('./transcriptStitcher');

// Adjust this if your Python binary is in a different location
const PYTHON_BIN = process.platform === 'win32' ? 'python' : 'python3';

// Path to our sidecar script
const SIDECAR_PATH = path.join(__dirname, '..', 'sidecar', 'transcribe.py');

class TranscriptionManager {
  constructor(controlWindow, projectorWindow) {
    this.controlWindow = controlWindow;     // operator window BrowserWindow
    this.projectorWindow = projectorWindow; // projector window BrowserWindow
    this.pyShell = null;
    this.stitcher = new TranscriptStitcher();
    this.isListening = false;

    // Queue chunks while Python is starting up
    this.pendingChunks = [];
    this.pythonReady = false;
  }

  init() {
    // ── Listen for audio chunks from the renderer ──────────────────────────
    ipcMain.on('audio:chunk', (event, { pcm, chunkIndex }) => {
      if (!this.isListening) return;

      const msg = { type: 'chunk', chunkIndex, pcm: Array.from(pcm) };

      if (!this.pythonReady) {
        // Buffer chunks while Python loads the model (can take ~5s on first run)
        this.pendingChunks.push(msg);
        return;
      }

      this._sendToPython(msg);
    });

    // ── Renderer requests to start/stop listening ──────────────────────────
    ipcMain.on('transcription:start', () => this.start());
    ipcMain.on('transcription:stop', () => this.stop());

    // ── Operator approves a verse for projection ───────────────────────────
    ipcMain.on('verse:project', (event, verse) => {
      this._projectVerse(verse);
    });

    ipcMain.on('verse:clear', () => {
      this._clearProjector();
    });
  }

  async start(options = {}) {
    if (this.isListening) return;

    const model = options.model || 'medium';
    const language = options.language || 'en';

    this.isListening = true;
    this.pythonReady = false;
    this.pendingChunks = [];
    this.stitcher.reset();

    this._broadcast('transcription:status', { status: 'starting', model });

    // ── Spawn Python sidecar ───────────────────────────────────────────────
    this.pyShell = new PythonShell(SIDECAR_PATH, {
      pythonPath: PYTHON_BIN,
      mode: 'json',            // send/receive JSON lines
      args: ['--model', model, '--language', language],
    });

    // ── Handle messages from Python ────────────────────────────────────────
    this.pyShell.on('message', (msg) => {
      if (msg.type === 'ready') {
        this.pythonReady = true;
        this._broadcast('transcription:status', { status: 'listening' });

        // Flush any chunks that arrived while Python was loading
        for (const chunk of this.pendingChunks) {
          this._sendToPython(chunk);
        }
        this.pendingChunks = [];
        return;
      }

      if (msg.type === 'transcript') {
        this._handleTranscript(msg);
      }
    });

    this.pyShell.on('stderr', (err) => {
      // Python prints model loading progress to stderr — log but don't crash
      console.log('[Python]', err);
    });

    this.pyShell.on('error', (err) => {
      console.error('[Python error]', err);
      this._broadcast('transcription:error', { message: err.message });
    });

    this.pyShell.on('close', () => {
      this.pythonReady = false;
      if (this.isListening) {
        this._broadcast('transcription:status', { status: 'stopped' });
      }
    });
  }

  stop() {
    if (!this.isListening) return;
    this.isListening = false;

    if (this.pyShell) {
      this.pyShell.send({ type: 'quit' });
      this.pyShell.end();
      this.pyShell = null;
    }

    this.pythonReady = false;
    this._broadcast('transcription:status', { status: 'stopped' });
  }

  _sendToPython(msg) {
    if (!this.pyShell || !this.pythonReady) return;
    try {
      this.pyShell.send(msg);
    } catch (err) {
      console.error('[Send to Python error]', err);
    }
  }

  _handleTranscript(msg) {
    // Stitch overlapping chunk into clean running transcript
    const newText = this.stitcher.ingest(msg);
    const fullTranscript = this.stitcher.getFullTranscript();

    // Recent text window for Bible quote detection (last ~15 seconds)
    const recentText = this.stitcher.getRecentText(15);

    // Send to control window: full transcript + just the new words
    this._broadcast('transcript:update', {
      newText,           // highlight these words in the UI
      fullTranscript,    // full scrolling transcript
      recentText,        // window used for Bible matching
      chunkIndex: msg.chunkIndex,
      words: msg.words,
    });
  }

  _projectVerse(verse) {
    // Send verse to the projector window
    if (this.projectorWindow && !this.projectorWindow.isDestroyed()) {
      this.projectorWindow.webContents.send('projector:show', verse);
    }
  }

  _clearProjector() {
    if (this.projectorWindow && !this.projectorWindow.isDestroyed()) {
      this.projectorWindow.webContents.send('projector:clear');
    }
  }

  /**
   * Broadcast an IPC event to the control window.
   */
  _broadcast(channel, data) {
    if (this.controlWindow && !this.controlWindow.isDestroyed()) {
      this.controlWindow.webContents.send(channel, data);
    }
  }
}

module.exports = { TranscriptionManager };
