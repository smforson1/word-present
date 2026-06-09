/// <reference types="vite/client" />

interface VerseQuery {
  translation: string;
  book: string;
  chapter: number;
  verseStart?: number;
  verseEnd?: number;
}

interface VerseResult {
  book: string;
  chapter: number;
  verse: number;
  text: string;
}

interface ParsedReference {
  book: string;
  chapter: number;
  verseStart?: number;
  verseEnd?: number;
}

interface BookmarkRecord {
  id?: number;
  translation: string;
  book: string;
  chapter: number;
  verseStart: number;
  verseEnd?: number;
  label: string;
  createdAt: string;
}

interface ProjectionData {
  reference: string;
  text: string;
  translation: string;
}

interface NetworkInfo {
  ip: string;
  port: number;
  pin: string;
}

interface TranslationRecord {
  translation: string;
  verseCount: number;
}

interface AppSettings {
  anthropicApiKey: string;
  groqApiKey: string;
  selectedTranslation: string;
  fontSizeScale: number;
  theme: string;
  whisperUrl: string;
  projectionBgColor: string;
  projectionBgMode: 'color' | 'image';
  projectionBgImage: string;
  projectionFontFamily: string;
  showVerseNumbers: boolean;
  aiMode: string;
}

interface Window {
  api: {
    // Database operations
    queryVerses: (query: VerseQuery) => Promise<VerseResult[]>;
    parseReference: (refStr: string) => Promise<ParsedReference | null>;
    getAdjacentVerse: (query: { translation: string; book: string; chapter: number; verse: number; direction: 'next' | 'prev' }) => Promise<VerseResult | null>;

    // Bible Browser
    getBooks: (translation: string) => Promise<string[]>;
    getChapterCount: (translation: string, book: string) => Promise<number>;
    getVerseCount: (translation: string, book: string, chapter: number) => Promise<number>;

    // Full-Text Search
    searchText: (translation: string, query: string, limit?: number) => Promise<VerseResult[]>;

    // Bookmarks
    getBookmarks: () => Promise<BookmarkRecord[]>;
    addBookmark: (bookmark: Omit<BookmarkRecord, 'id'>) => Promise<number>;
    removeBookmark: (id: number) => Promise<boolean>;

    // Translations
    getTranslations: () => Promise<TranslationRecord[]>;
    downloadTranslation: (code: string, url: string) => Promise<boolean | {error: string}>;
    importTranslationFile: (code: string) => Promise<boolean | {error: string}>;
    deleteTranslation: (code: string) => Promise<boolean>;

    // Persistent Settings
    getSettings: () => Promise<AppSettings>;
    setSettings: (key: keyof AppSettings, value: AppSettings[keyof AppSettings]) => Promise<AppSettings>;
    getNetworkInfo: () => Promise<NetworkInfo | null>;
    hasEnvKey: () => Promise<boolean>;
    hasGroqEnvKey: () => Promise<boolean>;
    initSpeechEngine: () => Promise<boolean>;
    transcribeChunk: (wavBuffer: Uint8Array) => Promise<string>;
    onSpeechInitProgress: (callback: (event: Electron.IpcRendererEvent, data: { status: string; detail?: string }) => void) => () => void;

    // Session Logging
    exportSessionPdf: (verses: ProjectionData[]) => Promise<boolean>;

    // Schedule Save/Load
    saveSchedule: (scheduleData: string) => Promise<boolean>;
    loadSchedule: () => Promise<string | null>;

    // System Events Listeners (Main -> Renderer)
    onProjectUpdate: (callback: (event: Electron.IpcRendererEvent, data: ProjectionData) => void) => () => void;
    onClearScreen: (callback: () => void) => () => void;
    onStatusUpdate: (callback: (event: Electron.IpcRendererEvent, status: Partial<AppSettings> & { blackout?: boolean }) => void) => () => void;
    onVUUpdate: (callback: (event: Electron.IpcRendererEvent, value: number) => void) => () => void;
    onAILog: (callback: (event: Electron.IpcRendererEvent, data: { type: 'info' | 'success' | 'warning' | 'error'; message: string }) => void) => () => void;
    onAISuggestion: (callback: (event: Electron.IpcRendererEvent, data: ProjectionData) => void) => () => void;
    onDetectedRef: (callback: (event: Electron.IpcRendererEvent, ref: string) => void) => () => void;

    // Actions (Renderer -> Main)
    forceProject: (verseData: ProjectionData) => void;
    clearProject: () => void;
    broadcastStatus: (status: Partial<AppSettings> & { blackout?: boolean }) => void;
    sendTranscript: (text: string) => void;
    logError: (message: string, stack: string) => void;
  };
}
