import { app, BrowserWindow, ipcMain, screen, session } from 'electron';
import { join } from 'path';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import Store from 'electron-store';
import { networkInterfaces } from 'os';
import * as fs from 'fs';
import { config as loadDotEnv } from 'dotenv';

import { BibleDatabase } from './db';
import { detectScriptureReferences, mightContainScriptureReference } from './claude';
import { detectScriptureReferencesOffline } from './scripture-detector';
import { exportSessionPdf, ExportedVerse } from './pdf-export';
import { dialog } from 'electron';
import { downloadOpenSourceTranslation, importLocalFile } from './translation-manager';

// Load .env — works in dev (project root) and in packaged builds (resources folder)
loadDotEnv({ path: join(app.isPackaged ? process.resourcesPath : process.cwd(), '.env') });

// Initialize Config Store
const store = new Store({
  defaults: {
    openAiApiKey: '',
    anthropicApiKey: '',
    selectedTranslation: 'KJV',
    fontSizeScale: 1.0,
    theme: 'dark',
    whisperUrl: 'http://localhost:8080',
    projectionBgColor: '#000000',
    projectionBgMode: 'color',
    projectionBgImage: '',
    projectionFontFamily: 'serif',
    showVerseNumbers: false,
    aiMode: 'auto-project' // 'auto-project' | 'suggest-only'
  }
});

// App State
let mainWindow: BrowserWindow | null = null;
let projectionWindow: BrowserWindow | null = null;
let db: BibleDatabase;
let socketServer: any = null;
let pin = Math.floor(1000 + Math.random() * 9000).toString();
let activeScripture: { reference: string; text: string; translation: string } | null = null;
let lastProjectedRef = '';
let lastProjectedTime = 0;

// Resolve Local IP
function getLocalIpAddress() {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

const localIp = getLocalIpAddress();
const PORT = 3000;

// Resolve dynamic dev port from Vite plugin environment if available
const devServerUrl = process.env.VITE_DEV_SERVER_URL;
const devPort = (() => {
  if (devServerUrl) {
    try {
      return new URL(devServerUrl).port || '5173';
    } catch {
      // fallback
    }
  }
  return '5173';
})();

// Create Windows
function createWindows() {
  db = new BibleDatabase();

  // Grant microphone and media permissions — must be set BEFORE windows are created
  session.defaultSession.setPermissionRequestHandler((_webContents: Electron.WebContents, permission: string, callback: (granted: boolean) => void) => {
    const allowed = ['media', 'microphone', 'audioCapture', 'notifications'];
    callback(allowed.includes(permission));
  });

  // Also pre-check media device access
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    return ['media', 'microphone', 'audioCapture'].includes(permission);
  });

  // 1. Operator Console
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Required for webkitSpeechRecognition and getUserMedia in Electron
      webSecurity: false,
    },
    title: 'Scripture Presenter - Operator Console'
  });

  const devUrl = devServerUrl || 'http://localhost:5173';
  const prodPath = join(__dirname, '../dist/index.html');

  const isDev = !app.isPackaged && fs.existsSync(join(__dirname, '../index.html'));

  // Retry loading a dev URL — the Vite server may not be ready yet
  const loadWithRetry = async (win: BrowserWindow, url: string, maxRetries = 10) => {
    for (let i = 0; i < maxRetries; i++) {
      try {
        await win.loadURL(url);
        return; // success
      } catch (err) {
        console.log(`[loadURL] attempt ${i + 1}/${maxRetries} failed for ${url}, retrying in 1s...`);
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    console.error(`[loadURL] gave up after ${maxRetries} retries for ${url}`);
  };

  if (isDev) {
    loadWithRetry(mainWindow, devUrl);
  } else {
    mainWindow.loadFile(prodPath);
  }

  // 2. Projection Screen (Secondary monitor placement)
  const displays = screen.getAllDisplays();
  const externalDisplay = displays.find((display) => {
    return display.bounds.x !== 0 || display.bounds.y !== 0;
  });

  projectionWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    frame: false,
    fullscreen: !!externalDisplay,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    title: 'Scripture Presenter - Projection Screen'
  });

  if (externalDisplay) {
    projectionWindow.setBounds({
      x: externalDisplay.bounds.x,
      y: externalDisplay.bounds.y,
      width: externalDisplay.bounds.width,
      height: externalDisplay.bounds.height
    });
  }

  if (isDev) {
    loadWithRetry(projectionWindow, `${devUrl}?view=projection`);
  } else {
    projectionWindow.loadFile(prodPath, { query: { view: 'projection' } });
  }

  mainWindow.on('closed', () => {
    if (projectionWindow) projectionWindow.close();
    app.quit();
  });
}

// Start HTTP and WebSocket Hub
function startNetworkServer() {
  const server = createServer((req, res) => {
    // Serve Mobile PWA
    // In dev mode, redirect to Vite server with remote query param
    if (!app.isPackaged && fs.existsSync(join(__dirname, '../index.html'))) {
      res.writeHead(302, { Location: `http://${localIp}:${devPort}/?view=remote` });
      res.end();
      return;
    }

    // In production, serve the compiled dist folder static assets
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    let filePath = join(__dirname, '../dist', url.pathname === '/' ? 'index.html' : url.pathname);
    
    // Check if the requested file exists, fallback to index.html for React SPA
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = join(__dirname, '../dist/index.html');
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end(JSON.stringify(err));
        return;
      }
      
      // Basic MIME type mapping
      let contentType = 'text/html';
      if (filePath.endsWith('.js')) contentType = 'text/javascript';
      else if (filePath.endsWith('.css')) contentType = 'text/css';
      else if (filePath.endsWith('.png')) contentType = 'image/png';
      else if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) contentType = 'image/jpeg';
      else if (filePath.endsWith('.webp')) contentType = 'image/webp';
      else if (filePath.endsWith('.json')) contentType = 'application/json';

      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    });
  });

  // Attach Socket.io
  socketServer = new SocketIOServer(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  // Socket event coordination
  socketServer.on('connection', (socket: any) => {
    // Send initial pairing status
    socket.emit('auth:request', { ip: localIp, port: PORT });

    // Handle pin verification
    socket.on('auth:verify', (inputPin: string) => {
      if (inputPin === pin) {
        socket.authenticated = true;
        socket.emit('auth:success', { activeScripture });
      } else {
        socket.emit('auth:failure', 'Invalid numeric PIN. Try again.');
      }
    });

    // Sync remote commands
    socket.on('project:force', (data: any) => {
      if (!socket.authenticated) return;
      handleForceProject(data);
    });

    socket.on('project:lookup', (refStr: string) => {
      if (!socket.authenticated) return;
      const parsed = db.parseReference(refStr);
      if (parsed) {
        const translation = store.get('selectedTranslation') as string;
        const verses = db.queryVerses({
          translation,
          book: parsed.book,
          chapter: parsed.chapter,
          verseStart: parsed.verseStart,
          verseEnd: parsed.verseEnd
        });
        if (verses.length > 0) {
          const showVerseNumbers = store.get('showVerseNumbers') as boolean;
          const textCombined = verses.map(v => showVerseNumbers ? `[${v.verse}] ${v.text}` : v.text).join(' ');
          const refFormatted = `${parsed.book} ${parsed.chapter}:${parsed.verseStart || 1}${parsed.verseEnd ? '-' + parsed.verseEnd : ''} (${translation})`;
          handleForceProject({ reference: refFormatted, text: textCombined, translation });
        } else {
          socket.emit('lookup:error', 'Scripture reference not found in local SQLite.');
        }
      } else {
        socket.emit('lookup:error', 'Invalid scripture reference format.');
      }
    });

    socket.on('project:clear', () => {
      if (!socket.authenticated) return;
      handleClearProject();
    });

    // Fix: Handle status broadcasts from mobile remotes (e.g., blackout toggle)
    socket.on('status:broadcast', (status: any) => {
      if (!socket.authenticated) return;
      broadcastSync('sync:status', status);
    });
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://${localIp}:${PORT}`);
  });
}

// Broadcast presentation state
function broadcastSync(event: string, payload: any) {
  // Sync electron windows via IPC
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(event, payload);
  }
  if (projectionWindow && !projectionWindow.isDestroyed()) {
    projectionWindow.webContents.send(event, payload);
  }
  // Sync socket clients
  if (socketServer) {
    socketServer.emit(event, payload);
  }
}

function handleForceProject(data: { reference: string; text: string; translation: string }) {
  activeScripture = data;
  broadcastSync('sync:project', data);
}

function handleClearProject() {
  activeScripture = null;
  broadcastSync('sync:clear', null);
}

// IPC Handlers Setup
function setupIpcHandlers() {
  // Database resolver
  ipcMain.handle('db:query-verses', async (_, query) => {
    await db.ready();
    return db.queryVerses(query);
  });

  ipcMain.handle('db:parse-reference', async (_, refStr) => {
    await db.ready();
    return db.parseReference(refStr);
  });

  // Settings Storage
  ipcMain.handle('settings:get', () => {
    return store.store;
  });

  ipcMain.handle('settings:set', (_, key, value) => {
    store.set(key, value);
    // Notify window components of theme/projection updates if settings change
    if (key === 'theme' || key === 'projectionBgColor' || key === 'projectionBgMode' || key === 'projectionBgImage' ||
        key === 'projectionFontFamily' || key === 'showVerseNumbers' || key === 'fontSizeScale') {
      broadcastSync('sync:status', { [key]: value });
    }
    return store.store;
  });

  // PDF Export
  ipcMain.handle('session:export-pdf', async (_, verses: ExportedVerse[]) => {
    return exportSessionPdf(verses);
  });

  // Bible Browser Handlers
  ipcMain.handle('db:get-books', async (_, translation: string) => {
    await db.ready();
    return db.getBooks(translation);
  });

  ipcMain.handle('db:get-chapter-count', async (_, translation: string, book: string) => {
    await db.ready();
    return db.getChapterCount(translation, book);
  });

  ipcMain.handle('db:get-verse-count', async (_, translation: string, book: string, chapter: number) => {
    await db.ready();
    return db.getVerseCount(translation, book, chapter);
  });

  // Full-Text Search
  ipcMain.handle('db:search-text', async (_, translation: string, query: string, limit?: number) => {
    await db.ready();
    return db.searchText(translation, query, limit);
  });

  // Bookmarks
  ipcMain.handle('db:get-bookmarks', async () => {
    await db.ready();
    return db.getBookmarks();
  });

  ipcMain.handle('db:add-bookmark', async (_, bookmark: any) => {
    await db.ready();
    return db.addBookmark(bookmark);
  });

  ipcMain.handle('db:remove-bookmark', async (_, id: number) => {
    await db.ready();
    db.removeBookmark(id);
    return true;
  });

  // Translations
  ipcMain.handle('db:get-translations', async () => {
    await db.ready();
    return db.getAvailableTranslations();
  });

  ipcMain.handle('translations:download', async (_, code: string, url: string) => {
    await db.ready();
    try {
      return await downloadOpenSourceTranslation(db, code, url);
    } catch (e: any) {
      return { error: e.message };
    }
  });

  ipcMain.handle('translations:import-file', async (_, code: string) => {
    await db.ready();
    const { filePaths } = await dialog.showOpenDialog({
      title: `Import ${code} Translation File`,
      filters: [{ name: 'JSON Files', extensions: ['json'] }],
      properties: ['openFile']
    });
    if (!filePaths || filePaths.length === 0) return false;
    
    try {
      return await importLocalFile(db, filePaths[0], code);
    } catch (e: any) {
      return { error: e.message };
    }
  });

  ipcMain.handle('translations:delete', async (_, code: string) => {
    await db.ready();
    return db.deleteTranslation(code);
  });

  // Schedule Save/Load
  ipcMain.handle('schedule:save', async (_, scheduleData: string) => {
    const { filePath } = await dialog.showSaveDialog({
      title: 'Save Service Schedule',
      defaultPath: `Service-Schedule-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'JSON Files', extensions: ['json'] }]
    });
    if (!filePath) return false;
    fs.writeFileSync(filePath, scheduleData, 'utf-8');
    return true;
  });

  ipcMain.handle('schedule:load', async () => {
    const { filePaths } = await dialog.showOpenDialog({
      title: 'Load Service Schedule',
      filters: [{ name: 'JSON Files', extensions: ['json'] }],
      properties: ['openFile']
    });
    if (!filePaths || filePaths.length === 0) return null;
    const data = fs.readFileSync(filePaths[0], 'utf-8');
    return data;
  });

  // Actions
  ipcMain.on('project:force', (_, data) => {
    handleForceProject(data);
  });

  ipcMain.on('project:clear', () => {
    handleClearProject();
  });

  // ── OpenAI Whisper Cloud Speech Engine ──────────────────────────────────────

  // Stub initialisation: cloud STT is always ready
  ipcMain.handle('speech:init', async (event) => {
    console.log('[speech:init] stub initializing...');
    if (!event.sender.isDestroyed()) {
      event.sender.send('speech:init-progress', { status: 'ready', detail: 'OpenAI Whisper Cloud STT ready.' });
    }
    return true;
  });

  // Transcribe one audio chunk (WAV buffer) via OpenAI Whisper API
  ipcMain.handle('speech:transcribe-chunk', async (_, wavBuffer: Uint8Array) => {
    console.log(`[transcribe] chunk received: ${wavBuffer?.length ?? 0} bytes`);
    
    const openAiApiKey = (process.env.OPENAI_API_KEY || store.get('openAiApiKey') || '') as string;
    if (!openAiApiKey.trim()) {
      console.warn('[transcribe] OpenAI API key is missing.');
      return '[Error: Please configure your OpenAI API Key in Settings to transcribe speech]';
    }

    try {
      // Create a native Blob from the Uint8Array buffer (received as WebM from MediaRecorder)
      const blob = new Blob([wavBuffer.buffer as ArrayBuffer], { type: 'audio/webm' });
      
      const formData = new FormData();
      formData.append('file', blob, 'audio.webm');
      formData.append('model', 'whisper-1');
      formData.append('language', 'en');

      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openAiApiKey}`
        },
        body: formData
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error('[transcribe] OpenAI API error response:', errText);
        try {
          const parsed = JSON.parse(errText);
          if (parsed?.error?.message) {
            return `[OpenAI Error: ${parsed.error.message}]`;
          }
        } catch (e) {
          // Ignore JSON parse error
        }
        return `[Error from OpenAI API: ${response.statusText}]`;
      }

      const data: any = await response.json();
      const text = (data?.text ?? '').trim();
      if (text) {
        console.log(`[transcribe] result: "${text}"`);
      }
      return text;
    } catch (e: any) {
      console.error('[transcribe] request error:', e);
      return `[Transcription Connection Error: ${e.message ?? e}]`;
    }
  });

  // ── AI Scripture Detection ─────────────────────────────────────────────────

  // AI Scripture analysis request
  ipcMain.on('ai:detect-scripture', async (event, text: string) => {
    const translation = store.get('selectedTranslation') as string;

    // ── Step 1: Offline pattern matching (always runs, zero latency) ─────────
    const offlineDetections = detectScriptureReferencesOffline(text);

    // ── Step 2: Optional Claude enhancement (only if API key is configured) ──
    const apiKey = process.env.ANTHROPIC_API_KEY || (store.get('anthropicApiKey') as string);
    let allDetections = offlineDetections;

    if (apiKey && mightContainScriptureReference(text) && offlineDetections.length === 0) {
      // Only call Claude when the offline detector found nothing but the text
      // looks like it might contain a reference — covers edge cases
      try {
        const claudeDetections = await detectScriptureReferences(apiKey, text);
        allDetections = claudeDetections;
      } catch {
        // Claude unavailable — offline results are sufficient
      }
    }

    if (allDetections.length === 0) {
      // Silent — don't log every chunk that has no reference
      return;
    }

    const aiMode = store.get('aiMode') as string;

    for (const ref of allDetections) {
      const fullRefStr = `${ref.book} ${ref.chapter}:${ref.verse || 1}${ref.endVerse ? '-' + ref.endVerse : ''}`;

      // Deduplication: prevent duplicate projection within 8 seconds
      const now = Date.now();
      if (fullRefStr === lastProjectedRef && (now - lastProjectedTime) < 8000) {
        event.sender.send('ai:log', { type: 'info', message: `Ignored duplicate detection: ${fullRefStr}` });
        continue;
      }

      // Query database
      await db.ready();
      const verses = db.queryVerses({
        translation,
        book: ref.book,
        chapter: ref.chapter,
        verseStart: ref.verse,
        verseEnd: ref.endVerse
      });

      if (verses.length === 0) {
        event.sender.send('ai:log', { type: 'warning', message: `Found "${fullRefStr}" but not present in ${translation} database.` });
        continue;
      }

      const showVerseNumbers = store.get('showVerseNumbers') as boolean;
      const textCombined = verses.map(v => showVerseNumbers ? `[${v.verse}] ${v.text}` : v.text).join(' ');
      lastProjectedRef = fullRefStr;
      lastProjectedTime = now;

      const projectionData = {
        reference: `${fullRefStr} (${translation})`,
        text: textCombined,
        translation
      };

      // Notify the renderer to highlight this reference in the transcript pane
      event.sender.send('ai:detected-ref', fullRefStr);

      if (aiMode === 'auto-project') {
        handleForceProject(projectionData);
        event.sender.send('ai:log', { type: 'success', message: `Auto-Projected: ${fullRefStr}` });
      } else {
        // Suggest-only mode: send to renderer as a suggestion banner
        event.sender.send('ai:suggestion', projectionData);
        event.sender.send('ai:log', { type: 'info', message: `Suggestion queued: ${fullRefStr} (awaiting operator approval)` });
      }
    }
  });

  // Send local details for QR configuration
  ipcMain.handle('settings:get-network', () => {
    return { ip: localIp, port: PORT, pin };
  });

  // Let the renderer know if an API key is available via env (without exposing the key itself)
  ipcMain.handle('settings:has-env-key', () => {
    return !!(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim());
  });

  ipcMain.handle('settings:has-openai-env-key', () => {
    return !!(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim());
  });

  // Check what speech recognition capabilities are available in this Electron build
  ipcMain.handle('speech:check-capabilities', async () => {
    return {
      // Speech API availability is checked client-side in the renderer
      // This just confirms the main process side is ready
      mainReady: true,
    };
  });

  // Log renderer-side exceptions to main process stdout/stderr
  ipcMain.on('system:log-error', (_, data) => {
    console.error('\n🚨 [RENDERER EXCEPTION] 🚨');
    console.error(`Message: ${data.message}`);
    if (data.stack) {
      console.error(`Stack trace:\n${data.stack}`);
    }
    console.error('---------------------------\n');
  });
}

app.whenReady().then(() => {
  setupIpcHandlers();
  createWindows();
  startNetworkServer();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindows();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
