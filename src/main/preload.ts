import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  // Database operations
  queryVerses: (query: { translation: string; book: string; chapter: number; verseStart?: number; verseEnd?: number }) => 
    ipcRenderer.invoke('db:query-verses', query),
  parseReference: (refStr: string) => 
    ipcRenderer.invoke('db:parse-reference', refStr),
  getAdjacentVerse: (query: { translation: string; book: string; chapter: number; verse: number; direction: 'next' | 'prev' }) =>
    ipcRenderer.invoke('db:get-adjacent-verse', query),

  // Bible Browser
  getBooks: (translation: string) => ipcRenderer.invoke('db:get-books', translation),
  getChapterCount: (translation: string, book: string) => ipcRenderer.invoke('db:get-chapter-count', translation, book),
  getVerseCount: (translation: string, book: string, chapter: number) => ipcRenderer.invoke('db:get-verse-count', translation, book, chapter),

  // Full-Text Search
  searchText: (translation: string, query: string, limit?: number) => ipcRenderer.invoke('db:search-text', translation, query, limit),

  // Bookmarks
  getBookmarks: () => ipcRenderer.invoke('db:get-bookmarks'),
  addBookmark: (bookmark: any) => ipcRenderer.invoke('db:add-bookmark', bookmark),
  removeBookmark: (id: number) => ipcRenderer.invoke('db:remove-bookmark', id),

  // Songs
  getSongs: (query: string) => ipcRenderer.invoke('db:get-songs', query),
  addSong: (song: any) => ipcRenderer.invoke('db:add-song', song),
  updateSong: (id: number, song: any) => ipcRenderer.invoke('db:update-song', id, song),
  deleteSong: (id: number) => ipcRenderer.invoke('db:delete-song', id),

  // Translations
  getTranslations: () => ipcRenderer.invoke('db:get-translations'),
  getTranslationCatalog: () => ipcRenderer.invoke('translations:get-catalog'),
  downloadTranslation: (code: string, url: string) => ipcRenderer.invoke('translations:download', code, url),
  importTranslationFile: (code: string) => ipcRenderer.invoke('translations:import-file', code),
  deleteTranslation: (code: string) => ipcRenderer.invoke('translations:delete', code),

  // Persistent Settings (electron-store)
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (key: string, value: any) => ipcRenderer.invoke('settings:set', key, value),
  getNetworkInfo: () => ipcRenderer.invoke('settings:get-network'),
  hasEnvKey: () => ipcRenderer.invoke('settings:has-env-key'),
  hasGroqEnvKey: () => ipcRenderer.invoke('settings:has-groq-env-key'),

  // Offline Speech Engine
  initSpeechEngine: () => ipcRenderer.invoke('speech:init'),
  transcribeChunk: (wavBuffer: Uint8Array) => ipcRenderer.invoke('speech:transcribe-chunk', wavBuffer),
  getSpeechModelsStatus: () => ipcRenderer.invoke('speech:get-models-status'),
  deleteSpeechModel: (modelName: string) => ipcRenderer.invoke('speech:delete-model', modelName),
  onSpeechInitProgress: (callback: (event: any, data: { status: string; detail?: string }) => void) => {
    ipcRenderer.on('speech:init-progress', callback);
    return () => ipcRenderer.removeListener('speech:init-progress', callback);
  },

  // Session Logging
  exportSessionPdf: (verses: any[]) => ipcRenderer.invoke('session:export-pdf', verses),

  // Schedule Save/Load
  saveSchedule: (scheduleData: string) => ipcRenderer.invoke('schedule:save', scheduleData),
  loadSchedule: () => ipcRenderer.invoke('schedule:load'),

  // System Events Listeners (Main -> Renderer)
  onProjectUpdate: (callback: (event: any, data: any) => void) => {
    ipcRenderer.on('sync:project', callback);
    return () => ipcRenderer.removeListener('sync:project', callback);
  },
  onClearScreen: (callback: () => void) => {
    ipcRenderer.on('sync:clear', callback);
    return () => ipcRenderer.removeListener('sync:clear', callback);
  },
  onStatusUpdate: (callback: (event: any, status: any) => void) => {
    ipcRenderer.on('sync:status', callback);
    return () => ipcRenderer.removeListener('sync:status', callback);
  },
  onVUUpdate: (callback: (event: any, value: number) => void) => {
    ipcRenderer.on('audio:vu-update', callback);
    return () => ipcRenderer.removeListener('audio:vu-update', callback);
  },
  onAILog: (callback: (event: any, data: any) => void) => {
    ipcRenderer.on('ai:log', callback);
    return () => ipcRenderer.removeListener('ai:log', callback);
  },
  onAISuggestion: (callback: (event: any, data: any) => void) => {
    ipcRenderer.on('ai:suggestion', callback);
    return () => ipcRenderer.removeListener('ai:suggestion', callback);
  },
  onDetectedRef: (callback: (event: any, ref: string) => void) => {
    ipcRenderer.on('ai:detected-ref', callback);
    return () => ipcRenderer.removeListener('ai:detected-ref', callback);
  },

  // Actions (Renderer -> Main)
  forceProject: (verseData: any) => ipcRenderer.send('project:force', verseData),
  clearProject: () => ipcRenderer.send('project:clear'),
  broadcastStatus: (status: any) => ipcRenderer.send('status:broadcast', status),
  sendTranscript: (text: string) => ipcRenderer.send('ai:detect-scripture', text),
  logError: (message: string, stack: string) => ipcRenderer.send('system:log-error', { message, stack })
});
