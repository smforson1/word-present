# Sermon Transcription App — Audio Pipeline

## File structure

```
sermon-app/
├── src/
│   ├── main/
│   │   ├── transcriptionManager.js   ← IPC bridge + Python sidecar manager
│   │   └── transcriptStitcher.js     ← Overlap deduplication algorithm
│   ├── renderer/
│   │   ├── audioCapture.js           ← Ring buffer + Web Audio API mic capture
│   │   └── rendererBridge.js         ← Renderer IPC glue + UI updates
│   └── sidecar/
│       └── transcribe.py             ← Python Whisper transcription worker
└── README.md
```

## Setup

### 1. Install Node dependencies
```bash
npm install electron python-shell
```

### 2. Install Python dependencies
```bash
pip install faster-whisper numpy
```

### 3. Wire into your main.js

```js
const { app, BrowserWindow } = require('electron');
const { TranscriptionManager } = require('./src/main/transcriptionManager');

let mainWindow, projectorWindow;

app.whenReady().then(() => {
  mainWindow = new BrowserWindow({
    width: 1200, height: 800,
    webPreferences: { nodeIntegration: true, contextIsolation: false }
  });
  mainWindow.loadFile('src/renderer/control.html');

  // Open projector on second screen
  const displays = require('electron').screen.getAllDisplays();
  const projectorDisplay = displays[1] || displays[0];

  projectorWindow = new BrowserWindow({
    x: projectorDisplay.bounds.x,
    y: projectorDisplay.bounds.y,
    fullscreen: true,
    webPreferences: { nodeIntegration: true, contextIsolation: false }
  });
  projectorWindow.loadFile('src/renderer/projector.html');

  const tm = new TranscriptionManager(mainWindow, projectorWindow);
  tm.init();
});
```

## How the no-drop guarantee works

```
Timeline:  |-------- 6s --------|
Chunk 1:   [=============================]
Chunk 2:               [=============================]
                       ^--- 2s overlap
Chunk 3:                           [=============================]

Every word is covered by at least 2 chunks.
The stitcher strips the duplicate overlap using word timestamps.
Result:    word1 word2 word3 word4 word5 word6 word7 ... (no repeats, no gaps)
```

## Whisper model sizes

| Model  | Size   | Speed (CPU) | Accuracy | Recommended for        |
|--------|--------|-------------|----------|------------------------|
| tiny   | 75MB   | Very fast   | Basic    | Testing only           |
| base   | 145MB  | Fast        | Good     | Fast machines          |
| small  | 466MB  | Medium      | Better   | Most laptops           |
| medium | 1.5GB  | Slower      | Best     | Sermons (recommended)  |
| large  | 3GB    | Slow        | Best+    | GPU machines only      |

## Key settings explained

- `word_timestamps=True` — gives each word a start/end time for precise stitching
- `vad_filter=True` — skips silence/music, only processes actual speech
- `condition_on_previous_text=True` — Whisper uses prior context, handles mid-sentence chunks
- `beam_size=5` — searches 5 candidate transcriptions, picks the best
- `temperature=0.0` — fully deterministic, no randomness
