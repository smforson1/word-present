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
import { detectScriptureReferencesOffline, formatScripturesInText } from './scripture-detector';
import { exportSessionPdf, ExportedVerse } from './pdf-export';
import { dialog } from 'electron';
import { downloadOpenSourceTranslation, importLocalFile } from './translation-manager';
import { initSpeechEngine, transcribeChunk, isSpeechEngineReady, getDownloadedModels, deleteModelFiles } from './speech-engine';

// Load .env — works in dev (project root) and in packaged builds (resources folder)
loadDotEnv({ path: join(app.isPackaged ? process.resourcesPath : process.cwd(), '.env') });

// Initialize Config Store
const store = new Store({
  defaults: {
    groqApiKey: '',
    anthropicApiKey: '',
    selectedTranslation: 'KJV',
    fontSizeScale: 1.0,
    theme: 'dark',
    whisperUrl: 'http://localhost:8080',
    projectionBgColor: '#000000',
    projectionBgMode: 'color',
    projectionBgGradient: 'twilight',
    projectionBgImage: '',
    projectionFontFamily: 'serif',
    showVerseNumbers: false,
    aiMode: 'auto-project', // 'auto-project' | 'suggest-only'

    // Dual Translation Settings
    secondaryTranslation: '',
    isDualProjectionEnabled: false,

    // Speech Model Manager
    selectedSpeechModel: 'Xenova/whisper-base.en',

    // Style Presets
    preset_scripture: {
      fontSizeScale: 1.0,
      projectionBgMode: 'global',
      projectionBgColor: '#000000',
      projectionBgGradient: 'twilight',
      projectionBgImage: '',
      projectionFontFamily: 'serif'
    },
    preset_song: {
      fontSizeScale: 1.2,
      projectionBgMode: 'global',
      projectionBgColor: '#000000',
      projectionBgGradient: 'twilight',
      projectionBgImage: '',
      projectionFontFamily: 'sans-serif'
    },
    preset_announcement: {
      fontSizeScale: 1.0,
      projectionBgMode: 'global',
      projectionBgColor: '#0f172a',
      projectionBgGradient: 'twilight',
      projectionBgImage: '',
      projectionFontFamily: 'sans-serif'
    },
    preset_custom: {
      fontSizeScale: 1.0,
      projectionBgMode: 'global',
      projectionBgColor: '#000000',
      projectionBgGradient: 'twilight',
      projectionBgImage: '',
      projectionFontFamily: 'serif'
    },

    // Noise Gate Settings
    isNoiseGateEnabled: true,
    noiseGateThreshold: 0.003
  }
});

// Migrate existing default presets to 'global' background mode
try {
  const currentScripture = store.get('preset_scripture') as any;
  if (currentScripture && currentScripture.projectionBgMode === 'color' && currentScripture.projectionBgColor === '#000000' && !currentScripture.projectionBgImage) {
    currentScripture.projectionBgMode = 'global';
    store.set('preset_scripture', currentScripture);
  }
  const currentSong = store.get('preset_song') as any;
  if (currentSong && currentSong.projectionBgMode === 'color' && currentSong.projectionBgColor === '#000000' && !currentSong.projectionBgImage) {
    currentSong.projectionBgMode = 'global';
    store.set('preset_song', currentSong);
  }
  const currentAnnouncement = store.get('preset_announcement') as any;
  if (currentAnnouncement && currentAnnouncement.projectionBgMode === 'color' && currentAnnouncement.projectionBgColor === '#0f172a' && !currentAnnouncement.projectionBgImage) {
    currentAnnouncement.projectionBgMode = 'global';
    store.set('preset_announcement', currentAnnouncement);
  }
  const currentCustom = store.get('preset_custom') as any;
  if (currentCustom && currentCustom.projectionBgMode === 'color' && currentCustom.projectionBgColor === '#000000' && !currentCustom.projectionBgImage) {
    currentCustom.projectionBgMode = 'global';
    store.set('preset_custom', currentCustom);
  }
} catch (e) {
  console.error('[Migration] Failed to migrate settings presets:', e);
}

// App State
let mainWindow: BrowserWindow | null = null;
let projectionWindow: BrowserWindow | null = null;
let db: BibleDatabase;
let socketServer: any = null;
let pin = Math.floor(1000 + Math.random() * 9000).toString();
let activeScripture: { reference: string; text: string; translation: string } | null = null;
let lastProjectedRef = '';
let lastProjectedTime = 0;
let activeTunnelUrl = '';
let activeTunnel: any = null;

// Resolve Local IP
function getLocalIpAddress() {
  const nets = networkInterfaces();
  const candidates: { name: string; address: string }[] = [];
  
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        candidates.push({ name, address: net.address });
      }
    }
  }
  
  if (candidates.length === 0) return 'localhost';

  const getPriority = (name: string): number => {
    const lower = name.toLowerCase();
    
    // Virtual interfaces are lowest priority
    if (lower.includes('virtualbox') || 
        lower.includes('vmware') || 
        lower.includes('wsl') || 
        lower.includes('docker') ||
        lower.includes('vethernet') ||
        lower.includes('host-only') ||
        lower.includes('loopback')) {
      return 0;
    }
    
    // Wi-Fi is highest priority for mobile pairing
    if (lower.includes('wi-fi') || lower.includes('wifi') || lower.includes('wireless')) {
      return 3;
    }
    
    // Standard Ethernet / Local Area Connection
    if (lower === 'ethernet' || lower === 'local area connection') {
      return 2;
    }
    
    // Numbered Ethernet adapters (like Ethernet 4, might be virtualBox)
    if (lower.startsWith('ethernet') || lower.startsWith('local area connection')) {
      return 1;
    }
    
    return 1;
  };
  
  // Sort candidates by priority desc
  candidates.sort((a, b) => getPriority(b.name) - getPriority(a.name));
  
  return candidates[0].address;
}

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
    // In dev mode, proxy to Vite server instead of redirecting so the client origin/port stays 3000
    if (!app.isPackaged && fs.existsSync(join(__dirname, '../index.html'))) {
      const http = require('http');
      const targetUrl = `http://localhost:${devPort}${req.url}`;
      const headers = { ...req.headers };
      headers.host = `localhost:${devPort}`;

      const proxyReq = http.request(targetUrl, {
        method: req.method,
        headers: headers
      }, (proxyRes: any) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res, { end: true });
      });

      proxyReq.on('error', (err: any) => {
        console.error('[Proxy Error] Failed to connect to Vite:', err);
        res.writeHead(502);
        res.end('Vite dev server unreachable. Please make sure Vite is running.');
      });

      req.pipe(proxyReq, { end: true });
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
    socket.emit('auth:request', { ip: getLocalIpAddress(), port: PORT });

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
          
          const isDual = store.get('isDualProjectionEnabled') as boolean;
          const secondaryTranslation = store.get('secondaryTranslation') as string;
          let secondaryText = '';
          if (isDual && secondaryTranslation && secondaryTranslation !== translation) {
            const secVerses = db.queryVerses({
              translation: secondaryTranslation,
              book: parsed.book,
              chapter: parsed.chapter,
              verseStart: parsed.verseStart,
              verseEnd: parsed.verseEnd
            });
            if (secVerses.length > 0) {
              secondaryText = secVerses.map(v => showVerseNumbers ? `[${v.verse}] ${v.text}` : v.text).join(' ');
            }
          }

          const projectPayload: any = { reference: refFormatted, text: textCombined, translation };
          if (secondaryText) {
            projectPayload.secondaryText = secondaryText;
            projectPayload.secondaryTranslation = secondaryTranslation;
          }
          
          handleForceProject(projectPayload);
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
    console.log(`Server listening on http://${getLocalIpAddress()}:${PORT}`);
    
    // Start localtunnel for public URL sharing
    try {
      const localtunnel = require('localtunnel');
      localtunnel({ port: PORT }).then((tunnel: any) => {
        activeTunnel = tunnel;
        activeTunnelUrl = tunnel.url;
        console.log(`Localtunnel active: ${activeTunnelUrl}`);
        
        // Notify open windows/consoles
        broadcastSync('sync:status', { tunnelUrl: activeTunnelUrl });
        
        tunnel.on('close', () => {
          console.log('Localtunnel tunnel closed');
          activeTunnel = null;
          activeTunnelUrl = '';
          broadcastSync('sync:status', { tunnelUrl: '' });
        });
      }).catch((err: any) => {
        console.error('[Localtunnel] Error establishing tunnel:', err);
      });
    } catch (err) {
      console.error('[Localtunnel] Failed to load localtunnel module:', err);
    }
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

  ipcMain.handle('db:get-adjacent-verse', async (_, query) => {
    await db.ready();
    return db.getAdjacentVerse(query.translation, query.book, query.chapter, query.verse, query.direction);
  });


  // Settings Storage
  ipcMain.handle('settings:get', () => {
    return store.store;
  });

  ipcMain.handle('settings:set', (_, key, value) => {
    store.set(key, value);
    // Notify window components of theme/projection updates if settings change
    if (key === 'theme' || key === 'projectionBgColor' || key === 'projectionBgMode' || key === 'projectionBgImage' ||
        key === 'projectionBgGradient' || key === 'projectionFontFamily' || key === 'showVerseNumbers' || key === 'fontSizeScale' ||
        key === 'secondaryTranslation' || key === 'isDualProjectionEnabled' ||
        key.startsWith('preset_') || key === 'isNoiseGateEnabled' || key === 'noiseGateThreshold') {
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

  // Songs
  ipcMain.handle('db:get-songs', async (_, query: string) => {
    await db.ready();
    return db.getSongs(query);
  });

  ipcMain.handle('db:add-song', async (_, song: any) => {
    await db.ready();
    return db.addSong(song);
  });

  ipcMain.handle('db:update-song', async (_, id: number, song: any) => {
    await db.ready();
    return db.updateSong(id, song);
  });

  ipcMain.handle('db:delete-song', async (_, id: number) => {
    await db.ready();
    return db.deleteSong(id);
  });

  // Translations
  const PUBLIC_TRANSLATION_CATALOG = [
    { code: "ASV", name: "American Standard Version", url: "https://bolls.life/static/translations/ASV.json" },
    { code: "WEB", name: "World English Bible", url: "https://bolls.life/static/translations/WEB.json" },
    { code: "BBE", name: "Bible in Basic English", url: "https://raw.githubusercontent.com/thiagobodruk/bible/master/json/en_bbe.json" }
  ];

  ipcMain.handle('translations:get-catalog', async () => {
    await db.ready();
    const installed = await db.getAvailableTranslations();
    const installedCodes = new Set(installed.map((t: any) => t.translation.toUpperCase()));
    return PUBLIC_TRANSLATION_CATALOG.map(item => ({
      ...item,
      isInstalled: installedCodes.has(item.code.toUpperCase())
    }));
  });

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

  // ── Offline Whisper Speech Engine (falls back to Groq if key is set) ────────

  // Initialise the local Whisper pipeline and relay progress events to the renderer
  ipcMain.handle('speech:init', async (event) => {
    console.log('[speech:init] starting offline Whisper engine…');
    const selectedModel = store.get('selectedSpeechModel') as string || 'Xenova/whisper-base.en';

    const ok = await initSpeechEngine((status, detail) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send('speech:init-progress', { status, detail });
      }
    }, selectedModel);

    return ok;
  });

  // Get cached models status
  ipcMain.handle('speech:get-models-status', async () => {
    const downloaded = getDownloadedModels();
    return {
      downloaded,
      activeModel: store.get('selectedSpeechModel') as string || 'Xenova/whisper-base.en'
    };
  });

  // Delete local model folder from cache
  ipcMain.handle('speech:delete-model', async (_, modelName: string) => {
    return deleteModelFiles(modelName);
  });

  // Transcribe one audio chunk.
  // Strategy: use offline Whisper first; fall back to Groq only when a key is
  // configured AND the local engine is not yet ready.
  // The renderer now always sends a proper WAV (44-byte header + Int16 LE PCM).
  ipcMain.handle('speech:transcribe-chunk', async (_, wavBuffer: Uint8Array) => {
    console.log(`[transcribe] chunk received: ${wavBuffer?.length ?? 0} bytes`);

    // Known Whisper hallucinations on silence / background noise — discard these.
    const HALLUCINATION_RE = /^\s*\*[^*]*\*?\s*$|^\s*\[(?:BLANK_AUDIO|silence|Silence|inaudible|Inaudible)[^\]]*\]\s*$/i;
    const cleanTranscript = (raw: string): string => {
      const t = raw.trim();
      if (!t || t.length <= 2) return '';              // bare *, **, punctuation noise
      if (HALLUCINATION_RE.test(t)) return '';
      if (/^[\s\W]+$/.test(t)) return '';              // all whitespace / punctuation
      return t;
    };

    // ── Parse WAV header to locate Int16 PCM data ─────────────────────────
    // WAV layout: bytes 0-3 "RIFF", data starts at byte 44.
    const parsePcmFromWav = (buf: Uint8Array): number[] => {
      if (buf.length < 44) return [];
      const view = new DataView(buf.buffer as ArrayBuffer, buf.byteOffset, buf.byteLength);
      const riff = String.fromCharCode(buf[0], buf[1], buf[2], buf[3]);
      if (riff !== 'RIFF') {
        console.warn('[transcribe] Buffer is not a WAV file, attempting raw Int16 parse');
        const samples: number[] = [];
        for (let i = 0; i + 1 < view.byteLength; i += 2) samples.push(view.getInt16(i, true));
        return samples;
      }
      // Skip 44-byte standard WAV header
      const samples: number[] = [];
      for (let i = 44; i + 1 < view.byteLength; i += 2) {
        samples.push(view.getInt16(i, true));
      }
      return samples;
    };

    // ── 1. Offline path (preferred) ──────────────────────────────────────────
    if (isSpeechEngineReady()) {
      const samples = parsePcmFromWav(wavBuffer);
      if (samples.length > 0) {
        const raw = await transcribeChunk(samples);
        const text = cleanTranscript(raw);
        if (text) {
          const formatted = formatScripturesInText(text);
          console.log(`[transcribe:offline] "${formatted}"`);
          return formatted;
        }
        return '';
      }
    }

    // ── 2. Groq cloud fallback (only when key is configured) ─────────────────
    const groqApiKey = (process.env.GROQ_API_KEY || store.get('groqApiKey') || '') as string;
    if (!groqApiKey.trim()) {
      console.warn('[transcribe] Offline engine not ready and no Groq API key configured.');
      return '';
    }

    try {
      // Send WAV directly — Groq accepts wav and it's what the renderer now sends
      const blob = new Blob([wavBuffer.buffer as ArrayBuffer], { type: 'audio/wav' });
      const formData = new FormData();
      formData.append('file', blob, 'audio.wav');
      formData.append('model', 'whisper-large-v3');
      formData.append('language', 'en');

      const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${groqApiKey}` },
        body: formData
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error('[transcribe:groq] error:', errText);
        try {
          const parsed = JSON.parse(errText);
          if (parsed?.error?.message) return `[Groq Error: ${parsed.error.message}]`;
        } catch { /* ignore */ }
        return `[Groq API Error: ${response.statusText}]`;
      }

      const data: any = await response.json();
      const raw = (data?.text ?? '').trim();
      const text = cleanTranscript(raw);
      if (text) {
        const formatted = formatScripturesInText(text);
        console.log(`[transcribe:groq] "${formatted}"`);
        return formatted;
      }
      return '';
    } catch (e: any) {
      console.error('[transcribe:groq] request error:', e);
      return `[Transcription Error: ${e.message ?? e}]`;
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
      if (ref.verse === undefined) continue; // Require a verse number for auto-projection/suggestions
      const fullRefStr = `${ref.book} ${ref.chapter}:${ref.verse}${ref.endVerse ? '-' + ref.endVerse : ''}`;

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

      // Handle dual translation resolution for AI suggestion/projection
      const isDual = store.get('isDualProjectionEnabled') as boolean;
      const secondaryTranslation = store.get('secondaryTranslation') as string;
      let secondaryText = '';
      if (isDual && secondaryTranslation && secondaryTranslation !== translation) {
        const secVerses = db.queryVerses({
          translation: secondaryTranslation,
          book: ref.book,
          chapter: ref.chapter,
          verseStart: ref.verse,
          verseEnd: ref.endVerse
        });
        if (secVerses.length > 0) {
          secondaryText = secVerses.map(v => showVerseNumbers ? `[${v.verse}] ${v.text}` : v.text).join(' ');
        }
      }

      const projectionData: any = {
        reference: `${fullRefStr} (${translation})`,
        text: textCombined,
        translation
      };
      if (secondaryText) {
        projectionData.secondaryText = secondaryText;
        projectionData.secondaryTranslation = secondaryTranslation;
      }

      // Notify the renderer to highlight this reference in the transcript pane
      event.sender.send('ai:detected-ref', fullRefStr);

      if (aiMode === 'auto-project') {
        handleForceProject(projectionData);
        const logMsg = `Auto-Projected: ${fullRefStr}${ref.reason ? ` (${ref.reason})` : ''}`;
        event.sender.send('ai:log', { type: 'success', message: logMsg });
      } else {
        // Suggest-only mode: send to renderer as a suggestion banner
        event.sender.send('ai:suggestion', projectionData);
        const logMsg = `Suggestion queued: ${fullRefStr}${ref.reason ? ` (${ref.reason})` : ''} (awaiting operator approval)`;
        event.sender.send('ai:log', { type: 'info', message: logMsg });
      }
    }
  });

  // Send local details for QR configuration
  ipcMain.handle('settings:get-network', () => {
    return { ip: getLocalIpAddress(), port: PORT, pin, tunnelUrl: activeTunnelUrl };
  });

  // Let the renderer know if an API key is available via env (without exposing the key itself)
  ipcMain.handle('settings:has-env-key', () => {
    return !!(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim());
  });

  ipcMain.handle('settings:has-groq-env-key', () => {
    return !!(process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim());
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
  if (activeTunnel) {
    try { activeTunnel.close(); } catch { /* ignore */ }
  }
  if (process.platform !== 'darwin') app.quit();
});
