import React, { useEffect, useState, useRef } from 'react';
import { 
  Mic, MicOff, Tv, Volume2, 
  Send, Trash2, Moon, Sun, AlertTriangle, CheckCircle, Info, Power,
  BookOpen, Search as SearchIcon, Upload, ChevronLeft, ChevronRight
} from 'lucide-react';
import QRCode from 'qrcode';

import BibleBrowser from './BibleBrowser';
import SearchPanel from './SearchPanel';
import BookmarksPanel from './BookmarksPanel';
import ServiceSchedule, { ScheduleItem } from './ServiceSchedule';

interface ScriptureHistoryItem {
  timestamp: string;
  reference: string;
  text: string;
  translation: string;
}

interface AILogItem {
  id: string;
  timestamp: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
}

const BACKGROUND_THEMES = [
  { id: 'starry_sky', name: 'Starry Sky', url: 'backgrounds/starry_sky.jpg' },
  { id: 'mountain_sunrise', name: 'Mountain Sunrise', url: 'backgrounds/mountain_sunrise.jpg' },
  { id: 'forest_rays', name: 'Forest Rays', url: 'backgrounds/forest_rays.jpg' },
  { id: 'clouds', name: 'Twilight Clouds', url: 'backgrounds/clouds.jpg' },
  { id: 'aurora', name: 'Northern Lights', url: 'backgrounds/aurora.jpg' },
  { id: 'waterfall', name: 'Waterfall Mist', url: 'backgrounds/waterfall.jpg' },
  { id: 'abstract_gradient', name: 'Abstract Gradient', url: 'backgrounds/abstract_gradient.jpg' }
];

const GRADIENT_THEMES = [
  { id: 'twilight', name: 'Twilight Glassmorphism', className: 'gradient-twilight', previewStyle: 'linear-gradient(135deg, hsl(260, 45%, 12%), hsl(290, 40%, 10%))' },
  { id: 'aurora', name: 'Midnight Aurora', className: 'gradient-aurora', previewStyle: 'linear-gradient(135deg, hsl(210, 55%, 8%), hsl(180, 45%, 10%))' },
  { id: 'forest', name: 'Velvet Forest', className: 'gradient-forest', previewStyle: 'linear-gradient(135deg, hsl(140, 35%, 8%), hsl(165, 30%, 10%))' },
  { id: 'golden', name: 'Golden Hour', className: 'gradient-golden', previewStyle: 'linear-gradient(135deg, hsl(15, 45%, 10%), hsl(35, 40%, 12%))' }
];

// ─────────────────────────────────────────────────────────────────────────────
// Transcript highlighter — wraps detected bible references in a colored span
// ─────────────────────────────────────────────────────────────────────────────
function HighlightedTranscript({ text, detectedRefs }: { text: string; detectedRefs: string[] }) {
  if (!detectedRefs.length) {
    return <span className="text-foreground">{text}</span>;
  }

  // Build a regex that matches any detected reference (case-insensitive, whole-word)
  const escaped = detectedRefs.map(r => r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`(${escaped.join('|')})`, 'gi');
  const parts = text.split(pattern);

  return (
    <>
      {parts.map((part, i) => {
        const isMatch = detectedRefs.some(r => r.toLowerCase() === part.toLowerCase());
        return isMatch ? (
          <mark key={i} className="bg-primary/25 text-primary font-semibold rounded px-0.5 not-italic">
            {part}
          </mark>
        ) : (
          <span key={i} className="text-foreground">{part}</span>
        );
      })}
    </>
  );
}



// Module-level flag — survives React StrictMode's double-mount in dev.
// Ensures speech:init IPC is sent at most once per renderer process lifetime.
let speechEngineInitStarted = false;

export default function OperatorConsole() {
  // Config & Settings State
  const [apiKey, setApiKey] = useState('');
  const [groqApiKey, setGroqApiKey] = useState('');
  const [translation, setTranslation] = useState('KJV');
  const [secondaryTranslation, setSecondaryTranslation] = useState('');
  const [isDualProjectionEnabled, setIsDualProjectionEnabled] = useState(false);
  const [availableTranslations, setAvailableTranslations] = useState<{translation: string, verseCount: number}[]>([]);
  const [fontSizeScale, setFontSizeScale] = useState(1.0);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [whisperUrl, setWhisperUrl] = useState('http://localhost:8080');
  const [projectionBgColor, setProjectionBgColor] = useState('#000000');
  const [projectionBgMode, setProjectionBgMode] = useState<'color' | 'image' | 'gradient'>('color');
  const [projectionBgImage, setProjectionBgImage] = useState('');
  const [projectionBgGradient, setProjectionBgGradient] = useState<string>('twilight');
  const [projectionFontFamily, setProjectionFontFamily] = useState('serif');
  const [showVerseNumbers, setShowVerseNumbers] = useState(false);
  const [aiMode, setAiMode] = useState('auto-project');

  // Network Pairing State
  const [networkInfo, setNetworkInfo] = useState<{ ip: string; port: number; pin: string } | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [envKeyActive, setEnvKeyActive] = useState(false);
  const [groqEnvKeyActive, setGroqEnvKeyActive] = useState(false);

  // Audio & Mic Pipeline State
  const [isRecording, setIsRecording] = useState(false);
  const isRecordingRef = useRef(false); // Ref for accurate closure access
  const [vuLevel, setVuLevel] = useState(0);
  const [audioInputDevices, setAudioInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioDevice, setSelectedAudioDevice] = useState('');

  // Transcription & AI State
  const [transcript, setTranscript] = useState('');
  const [isFading, setIsFading] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [detectedRefs, setDetectedRefs] = useState<string[]>([]);
  const [speechEngineStatus, setSpeechEngineStatus] = useState<'idle' | 'downloading' | 'loading' | 'ready' | 'error'>('idle');
  const [modelProgressDetail, setModelProgressDetail] = useState('');
  const [speechModelsStatus, setSpeechModelsStatus] = useState<{ downloaded: string[]; activeModel: string }>({
    downloaded: [],
    activeModel: 'Xenova/whisper-base.en'
  });
  const [aiLogs, setAiLogs] = useState<AILogItem[]>([]);
  const [activeProjected, setActiveProjected] = useState<{ reference: string; text: string; translation: string; secondaryText?: string; secondaryTranslation?: string; slideType?: string; preset?: any } | null>(null);
  const [blackout, setBlackout] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<{ reference: string; text: string; translation: string; secondaryText?: string; secondaryTranslation?: string; slideType?: string; preset?: any } | null>(null);

  // Style Presets State
  const [presetScripture, setPresetScripture] = useState<any>(null);
  const [presetSong, setPresetSong] = useState<any>(null);
  const [presetAnnouncement, setPresetAnnouncement] = useState<any>(null);
  const [presetCustom, setPresetCustom] = useState<any>(null);
  const [editingPresetCategory, setEditingPresetCategory] = useState<'scripture' | 'song' | 'announcement' | 'custom'>('scripture');

  // Noise Gate State
  const [isNoiseGateEnabled, setIsNoiseGateEnabledState] = useState(true);
  const [noiseGateThreshold, setNoiseGateThresholdState] = useState(0.003);
  const isNoiseGateEnabledRef = useRef(true);
  const noiseGateThresholdRef = useRef(0.003);

  const setIsNoiseGateEnabled = (val: boolean) => {
    setIsNoiseGateEnabledState(val);
    isNoiseGateEnabledRef.current = val;
    if (window.api) window.api.setSettings('isNoiseGateEnabled', val);
  };

  const setNoiseGateThreshold = (val: number) => {
    setNoiseGateThresholdState(val);
    noiseGateThresholdRef.current = val;
    if (window.api) window.api.setSettings('noiseGateThreshold', val);
  };

  // Translation Catalog State
  const [catalog, setCatalog] = useState<{ code: string; name: string; url: string; isInstalled: boolean }[]>([]);

  const refreshCatalog = () => {
    if (!window.api || !window.api.getTranslationCatalog) return;
    window.api.getTranslationCatalog()
      .then(setCatalog)
      .catch(err => console.error('[Console] Failed to load translation catalog:', err));
  };

  // Manual Control State
  const [manualReference, setManualReference] = useState('');
  const [manualError, setManualError] = useState('');

  // History & Schedule
  const [history, setHistory] = useState<ScriptureHistoryItem[]>([]);
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [bookmarksRefresh, setBookmarksRefresh] = useState(0);

  // Bookmark Label State
  const [pendingBookmark, setPendingBookmark] = useState<{
    book: string; chapter: number; verseStart: number; verseEnd?: number; text: string;
  } | null>(null);
  const [bookmarkLabel, setBookmarkLabel] = useState('');

  // Layout State
  const [middleTab, setMiddleTab] = useState<'browser' | 'search' | 'manual' | 'ai'>('browser');
  const [rightTab, setRightTab] = useState<'schedule' | 'bookmarks' | 'history' | 'settings'>('schedule');

  // Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const pcmBufferRef = useRef<Float32Array>(new Float32Array(0));
  const rollingWindowRef = useRef<string[]>([]);
  const subtitleTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const detectDebounceRef = useRef<NodeJS.Timeout | null>(null);

  const loadSpeechModelsStatus = () => {
    if (!window.api || !window.api.getSpeechModelsStatus) return;
    window.api.getSpeechModelsStatus()
      .then(setSpeechModelsStatus)
      .catch(err => console.error('[Console] Failed to fetch cached models list:', err));
  };

  const handleSelectSpeechModel = async (modelName: string) => {
    if (!window.api) return;
    await window.api.setSettings('selectedSpeechModel', modelName);
    setSpeechModelsStatus(prev => ({ ...prev, activeModel: modelName }));
    addAiLog('info', `Switched active Whisper model to ${modelName}. Re-initializing engine…`);

    setSpeechEngineStatus('loading');
    window.api.initSpeechEngine().then((ready: boolean) => {
      if (ready) {
        setSpeechEngineStatus('ready');
        loadSpeechModelsStatus();
      } else {
        setSpeechEngineStatus('error');
        addAiLog('error', 'Failed to initialize the new speech model.');
      }
    }).catch((err: any) => {
      setSpeechEngineStatus('error');
      addAiLog('error', `Speech engine swap failed: ${err?.message ?? err}`);
    });
  };

  const handleDeleteSpeechModel = async (modelName: string) => {
    if (!window.api || !window.api.deleteSpeechModel) return;
    if (confirm(`Delete local speech model files for ${modelName}?`)) {
      addAiLog('info', `Deleting model files for ${modelName}...`);
      const ok = await window.api.deleteSpeechModel(modelName);
      if (ok) {
        addAiLog('success', `Deleted speech model ${modelName}.`);
        loadSpeechModelsStatus();
      } else {
        addAiLog('error', `Could not delete speech model ${modelName}.`);
      }
    }
  };

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  useEffect(() => {
    if (!window.api) return;

    window.api.getSettings().then((settings: any) => {
      setApiKey(settings.anthropicApiKey || '');
      setGroqApiKey(settings.groqApiKey || '');
      setTranslation(settings.selectedTranslation || 'KJV');
      setSecondaryTranslation(settings.secondaryTranslation || '');
      setIsDualProjectionEnabled(settings.isDualProjectionEnabled || false);
      setFontSizeScale(settings.fontSizeScale || 1.0);
      setIsDarkMode(settings.theme === 'dark');
      setWhisperUrl(settings.whisperUrl || 'http://localhost:8080');
      setProjectionBgColor(settings.projectionBgColor || '#000000');
      setProjectionBgMode(settings.projectionBgMode || 'color');
      setProjectionBgImage(settings.projectionBgImage || '');
      setProjectionBgGradient(settings.projectionBgGradient || 'twilight');
      setProjectionFontFamily(settings.projectionFontFamily || 'serif');
      setShowVerseNumbers(settings.showVerseNumbers || false);
      setAiMode(settings.aiMode || 'auto-project');
      if (settings.selectedSpeechModel) {
        setSpeechModelsStatus(prev => ({ ...prev, activeModel: settings.selectedSpeechModel }));
      }
      
      // Load presets
      if (settings.preset_scripture) setPresetScripture(settings.preset_scripture);
      if (settings.preset_song) setPresetSong(settings.preset_song);
      if (settings.preset_announcement) setPresetAnnouncement(settings.preset_announcement);
      if (settings.preset_custom) setPresetCustom(settings.preset_custom);

      // Load Noise Gate settings
      const noiseGateOn = settings.isNoiseGateEnabled !== undefined ? settings.isNoiseGateEnabled : true;
      setIsNoiseGateEnabledState(noiseGateOn);
      isNoiseGateEnabledRef.current = noiseGateOn;

      const noiseGateVal = settings.noiseGateThreshold !== undefined ? settings.noiseGateThreshold : 0.003;
      setNoiseGateThresholdState(noiseGateVal);
      noiseGateThresholdRef.current = noiseGateVal;
    });

    window.api.getTranslations().then((trans) => {
      setAvailableTranslations(trans);
      refreshCatalog();
    });

    // Check if API keys are configured via .env (without exposing them to the UI)
    window.api.hasEnvKey().then(setEnvKeyActive);
    window.api.hasGroqEnvKey().then(setGroqEnvKeyActive);
    
    // Load local speech models list
    loadSpeechModelsStatus();

    // Initialize Whisper speech engine via main process IPC
    let unsubProgress: (() => void) | null = null;
    if (!speechEngineInitStarted) {
      speechEngineInitStarted = true;
      setSpeechEngineStatus('loading');
      addAiLog('info', 'Loading offline speech model…');

      // Listen for progress updates from main process
      unsubProgress = window.api.onSpeechInitProgress((_: any, data: { status: string; detail?: string }) => {
        const { status, detail } = data;
        if (status === 'downloading') {
          setSpeechEngineStatus('downloading');
          setModelProgressDetail(detail ?? 'Downloading model…');
          addAiLog('info', detail ?? 'Downloading model…');
        } else if (status === 'loading') {
          setSpeechEngineStatus('loading');
          setModelProgressDetail(detail ?? 'Loading model into memory…');
          addAiLog('info', detail ?? 'Loading model into memory…');
        } else if (status === 'ready') {
          setSpeechEngineStatus('ready');
          setModelProgressDetail('');
          addAiLog('success', detail ?? 'Offline speech model ready — click Start Listening to begin.');
          loadSpeechModelsStatus();
        } else if (status === 'error') {
          setSpeechEngineStatus('error');
          setModelProgressDetail(detail ?? 'Speech model failed to load.');
          addAiLog('error', detail ?? 'Speech model failed to load.');
        }
      });

      window.api.initSpeechEngine().then((ready: boolean) => {
        if (ready) {
          setSpeechEngineStatus('ready');
          loadSpeechModelsStatus();
        } else {
          setSpeechEngineStatus('error');
          addAiLog('error', 'Speech engine initialization returned false.');
        }
      }).catch((err: any) => {
        setSpeechEngineStatus('error');
        addAiLog('error', `Could not start speech engine: ${err?.message ?? err}`);
      });
    }

    window.api.getNetworkInfo().then((info: any) => {
      setNetworkInfo(info);
      if (info) {
        const url = `http://${info.ip}:${info.port}/?view=remote`;
        QRCode.toDataURL(url)
          .then((dataUrl: string) => setQrDataUrl(dataUrl))
          .catch((err: any) => console.error('[Startup] QR Code generation failed:', err));
      }
    }).catch((err: any) => console.error('[Startup] Failed to fetch network info:', err));

    const updateDevices = () => {
      navigator.mediaDevices.enumerateDevices().then(devices => {
        const audioDevs = devices.filter(d => d.kind === 'audioinput');
        setAudioInputDevices(audioDevs);
        setSelectedAudioDevice(current => {
          const stillExists = audioDevs.some(d => d.deviceId === current);
          if (stillExists) return current;
          return audioDevs.length > 0 ? audioDevs[0].deviceId : '';
        });
      }).catch((err: any) => console.error('[Microphone] Failed to enumerate audio devices:', err));
    };

    updateDevices();
    if (navigator.mediaDevices && typeof navigator.mediaDevices.addEventListener === 'function') {
      navigator.mediaDevices.addEventListener('devicechange', updateDevices);
    }

    const unsubscribeProject = window.api.onProjectUpdate((_, data) => {
      setActiveProjected(data);
      setAiSuggestion(null); // Clear suggestion if projecting
      setHistory(prev => {
        const duplicate = prev.some(item => item.reference === data.reference && item.translation === data.translation);
        if (duplicate) return prev;
        const newItem: ScriptureHistoryItem = {
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          reference: data.reference,
          text: data.text,
          translation: data.translation
        };
        return [newItem, ...prev];
      });
    });

    const unsubscribeClear = window.api.onClearScreen(() => setActiveProjected(null));
    const unsubscribeAILog = window.api.onAILog((_, log) => addAiLog(log.type, log.message));
    const unsubscribeAISuggest = window.api.onAISuggestion((_, data) => setAiSuggestion(data));
    const unsubscribeDetectedRef = window.api.onDetectedRef((_, ref) => {
      setDetectedRefs(prev => prev.includes(ref) ? prev : [...prev, ref]);
    });

    return () => {
      unsubscribeProject();
      unsubscribeClear();
      unsubscribeAILog();
      unsubscribeAISuggest();
      unsubscribeDetectedRef();
      if (unsubProgress) unsubProgress();
      stopMicrophone(true);
      if (navigator.mediaDevices && typeof navigator.mediaDevices.removeEventListener === 'function') {
        navigator.mediaDevices.removeEventListener('devicechange', updateDevices);
      }
    };
  }, []);

  useEffect(() => {
    refreshCatalog();
  }, [availableTranslations]);

  useEffect(() => {
    if (isRecording && selectedAudioDevice) {
      console.log('[Microphone] Active device changed, restarting stream...');
      stopMicrophone();
      const t = setTimeout(startMicrophone, 300);
      return () => clearTimeout(t);
    }
  }, [selectedAudioDevice]);

  const toggleTheme = () => {
    const nextMode = !isDarkMode;
    setIsDarkMode(nextMode);
    window.api.setSettings('theme', nextMode ? 'dark' : 'light');
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT') return;

      if (e.code === 'Space') {
        e.preventDefault();
        toggleMicrophone();
      } else if (e.code === 'Escape') {
        e.preventDefault();
        handleClear();
      } else if (e.code === 'KeyB') {
        e.preventDefault();
        handleToggleBlackout();
      } else if (e.ctrlKey && e.code === 'KeyF') {
        e.preventDefault();
        setMiddleTab('search');
      } else if (e.code === 'ArrowLeft' && activeProjected) {
        e.preventDefault();
        handleAdjacentVerse('prev');
      } else if (e.code === 'ArrowRight' && activeProjected) {
        e.preventDefault();
        handleAdjacentVerse('next');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [blackout, activeProjected]); // remove isRecording to avoid stale closure if not using ref properly. Space uses toggleMicrophone which we must ensure uses ref.

  // Live update projection when translation, dual-translation, or showVerseNumbers changes
  useEffect(() => {
    if (!window.api || !activeProjected) return;

    // Strip trailing translation suffix e.g. "Genesis 1:1 (NIV)" → "Genesis 1:1"
    const cleanRef = activeProjected.reference.replace(/\s*\([^)]*\)\s*$/, '');

    window.api.parseReference(cleanRef).then(async (parsed) => {
      if (parsed) {
        const verses = await window.api.queryVerses({
          translation,
          book: parsed.book,
          chapter: parsed.chapter,
          verseStart: parsed.verseStart,
          verseEnd: parsed.verseEnd
        });
        if (verses.length > 0) {
          const textCombined = verses.map((v: any) => showVerseNumbers ? `[${v.verse}] ${v.text}` : v.text).join(' ');
          const refFormatted = `${parsed.book} ${parsed.chapter}:${parsed.verseStart || 1}${parsed.verseEnd ? '-' + parsed.verseEnd : ''} (${translation})`;
          project(refFormatted, textCombined);
        }
      }
    });
  }, [translation, secondaryTranslation, isDualProjectionEnabled, showVerseNumbers]);

  const addAiLog = (type: 'info' | 'success' | 'warning' | 'error', message: string) => {
    setAiLogs(prev => [{
      id: Math.random().toString(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      type,
      message
    }, ...prev.slice(0, 49)]);
  };

  // ── Encode Float32 PCM samples into a WAV ArrayBuffer ─────────────────
  const encodeWav = (samples: Float32Array, sampleRate: number): ArrayBuffer => {
    const dataLen = samples.length * 2; // Int16 = 2 bytes per sample
    const buffer = new ArrayBuffer(44 + dataLen);
    const view = new DataView(buffer);
    const ws = (off: number, str: string) => { for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i)); };
    ws(0, 'RIFF');  view.setUint32(4, 36 + dataLen, true);
    ws(8, 'WAVE');  ws(12, 'fmt ');
    view.setUint32(16, 16, true);         // PCM sub-chunk size
    view.setUint16(20, 1, true);          // PCM format
    view.setUint16(22, 1, true);          // mono
    view.setUint32(24, sampleRate, true); // sample rate
    view.setUint32(28, sampleRate * 2, true); // byte rate (sr * channels * bytesPerSample)
    view.setUint16(32, 2, true);          // block align
    view.setUint16(34, 16, true);         // bits per sample
    ws(36, 'data'); view.setUint32(40, dataLen, true);
    let off = 44;
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      off += 2;
    }
    return buffer;
  };

  // ── Audio chunk → Whisper transcription via main process IPC ────────────
  // Receives raw Float32 PCM at 16 kHz directly from the ScriptProcessorNode —
  // no WebM decoding step, no blob handling, no fragility.
  const processAudioChunk = async (samples: Float32Array) => {
    if (!isRecordingRef.current) return;
    try {
      // RMS energy gate — skip chunks that are just background silence
      let rms = 0;
      for (let i = 0; i < samples.length; i++) rms += samples[i] * samples[i];
      rms = Math.sqrt(rms / samples.length);
      if (isNoiseGateEnabledRef.current && rms < noiseGateThresholdRef.current) {
        console.log(`[AudioProcessor] Chunk too quiet (rms=${rms.toFixed(4)} < threshold=${noiseGateThresholdRef.current}), skipping.`);
        return;
      }

      console.log(`[AudioProcessor] Sending ${samples.length} samples (rms=${rms.toFixed(4)})`);
      setInterimTranscript('…');

      // Encode raw PCM as a WAV file — main process parses the header to get Int16 samples
      const wavBuffer = encodeWav(samples, 16000);
      const wavUint8 = new Uint8Array(wavBuffer);

      const text = await window.api.transcribeChunk(wavUint8);
      console.log(`[AudioProcessor] Transcribed: "${text}"`);

      setInterimTranscript('');
      if (text && text.length > 1 && isRecordingRef.current) {
        if (subtitleTimeoutRef.current) clearTimeout(subtitleTimeoutRef.current);
        setIsFading(false);
        setTranscript(prev => (prev ? prev + ' ' : '') + text);
        triggerAIDetection(text);
        subtitleTimeoutRef.current = setTimeout(() => {
          setIsFading(true);
          setTimeout(() => {
            setTranscript('');
            setDetectedRefs([]);
            setIsFading(false);
          }, 500);
        }, 3000);
      }
    } catch (err: any) {
      console.error('[AudioProcessor] Transcription pipeline failed:', err);
      setInterimTranscript('');
      addAiLog('warning', `Audio transcription error: ${err?.message ?? 'unknown'}`);
    }
  };

  const startMicrophone = async () => {
    console.log('[Microphone] Requesting stream access. Target Device ID:', selectedAudioDevice || 'Default');
    try {
      // ── 1. Get microphone stream ────────────────────────────────────
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: selectedAudioDevice ? { exact: selectedAudioDevice } : undefined,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });
      audioStreamRef.current = stream;
      console.log('[Microphone] Stream acquired. Active tracks:', stream.getAudioTracks().map(t => t.label));

      // AudioContext at exactly 16 kHz so we capture PCM at Whisper's native rate
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      audioContextRef.current = audioCtx;
      if (audioCtx.state === 'suspended') await audioCtx.resume();
      console.log('[Microphone] AudioContext sample rate:', audioCtx.sampleRate, 'state:', audioCtx.state);

      const source = audioCtx.createMediaStreamSource(stream);

      // ── 2. Analyser for VU meter ─────────────────────────────────────
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let lastVuUpdate = 0;
      const updateMeter = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        let total = 0;
        for (let i = 0; i < dataArray.length; i++) total += dataArray[i];
        const now = Date.now();
        if (now - lastVuUpdate > 100) {
          setVuLevel(Math.min(100, Math.round((total / dataArray.length / 128) * 100)));
          lastVuUpdate = now;
        }
        animationFrameRef.current = requestAnimationFrame(updateMeter);
      };
      updateMeter();

      // ── 3. AudioWorklet — captures raw PCM in a dedicated audio thread ─────
      // AudioWorklet runs in AudioWorkletGlobalScope (separate thread from the
      // renderer), so PCM accumulation never stalls the UI or causes blank screens.
      pcmBufferRef.current = new Float32Array(0);

      // The worklet script is served from /public in Vite
      await audioCtx.audioWorklet.addModule('/audio-chunk-processor.js');
      const workletNode = new AudioWorkletNode(audioCtx, 'audio-chunk-processor');
      processorRef.current = workletNode as unknown as ScriptProcessorNode;

      workletNode.port.onmessage = (event) => {
        if (event.data?.type === 'chunk' && isRecordingRef.current) {
          const samples = new Float32Array(event.data.data);
          processAudioChunk(samples);
        }
      };

      // Connect: source → worklet → silent sink (no speaker feedback)
      source.connect(workletNode);
      workletNode.connect(audioCtx.createMediaStreamDestination());

      addAiLog('success', 'Listening — capturing raw PCM at 16 kHz…');
    } catch (err: any) {
      console.error('[Microphone] Failed to initialize:', err);
      const msg = err?.message ?? String(err);
      addAiLog('error',
        msg.includes('Permission') || msg.includes('NotAllowed') || msg.includes('not allowed')
          ? 'Microphone permission denied. Go to Windows Settings → Privacy → Microphone and allow access.'
          : `Speech capture error: ${msg}`
      );
      setIsRecording(false);
      stopMicrophone();
    }
  };

  const stopMicrophone = (isUnmounting: boolean = false) => {
    console.log(`[Microphone] Stopping stream. Is Unmounting: ${isUnmounting}`);
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);

    // Disconnect AudioWorkletNode and clear PCM buffer
    if (processorRef.current) {
      try {
        // Tell the worklet to stop accumulating before we disconnect
        (processorRef.current as unknown as AudioWorkletNode).port?.postMessage('stop');
        processorRef.current.disconnect();
      } catch { /* ignore */ }
      processorRef.current = null;
    }
    pcmBufferRef.current = new Float32Array(0);

    if (audioStreamRef.current) {
      try { audioStreamRef.current.getTracks().forEach(t => t.stop()); } catch { /* ignore */ }
    }
    if (audioContextRef.current) {
      try { audioContextRef.current.close(); } catch { /* ignore */ }
    }
    audioStreamRef.current = null;
    audioContextRef.current = null;
    analyserRef.current = null;

    // Cancel any pending debounced scripture detection
    if (detectDebounceRef.current) {
      clearTimeout(detectDebounceRef.current);
      detectDebounceRef.current = null;
    }

    if (!isUnmounting) {
      setVuLevel(0);
      setInterimTranscript('');
      if (subtitleTimeoutRef.current) clearTimeout(subtitleTimeoutRef.current);
      setTranscript('');
      setDetectedRefs([]);
      setIsFading(false);
    }
  };

  const toggleMicrophone = () => {
    const nextState = !isRecordingRef.current;
    setIsRecording(nextState);
    if (nextState) {
      startMicrophone();
    } else {
      stopMicrophone();
      rollingWindowRef.current = [];
      addAiLog('info', 'Microphone stopped.');
    }
  };

  const triggerAIDetection = (newText: string) => {
    // Maintain a rolling window of the last ~80 words for richer context.
    // 80 words covers ~30-40 seconds of speech, ensuring that references
    // split across 4-second chunk boundaries are both present before detection fires.
    const incoming = newText.trim().split(/\s+/).filter(Boolean);
    rollingWindowRef.current = [...rollingWindowRef.current, ...incoming].slice(-80);

    if (!window.api) return;

    // Debounce the actual sendTranscript call by 150ms.
    // If a second chunk arrives quickly (e.g., both halves of a split sentence
    // finish transcribing close together), we wait for both to land in the
    // rolling window before firing scripture detection — preventing a miss.
    if (detectDebounceRef.current) clearTimeout(detectDebounceRef.current);
    detectDebounceRef.current = setTimeout(() => {
      const chunk = rollingWindowRef.current.join(' ');
      if (chunk.length < 5) return;
      window.api.sendTranscript(chunk);
    }, 150);
  };

  const handleManualSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setManualError('');
    if (!manualReference.trim()) return;
    try {
      const parsed = await window.api.parseReference(manualReference);
      if (parsed) {
        const verses = await window.api.queryVerses({
          translation, book: parsed.book, chapter: parsed.chapter,
          verseStart: parsed.verseStart, verseEnd: parsed.verseEnd
        });
        if (verses.length > 0) {
          const textCombined = verses.map((v: any) => showVerseNumbers ? `[${v.verse}] ${v.text}` : v.text).join(' ');
          const refFormatted = `${parsed.book} ${parsed.chapter}:${parsed.verseStart || 1}${parsed.verseEnd ? '-' + parsed.verseEnd : ''} (${translation})`;
          project(refFormatted, textCombined);
          setManualReference('');
        } else setManualError('Scripture not found in offline SQLite database.');
      } else setManualError('Invalid scripture reference format.');
    } catch (err) {
      setManualError('Query search execution error.');
    }
  };

  const project = async (reference: string, text: string, slideType?: 'scripture' | 'song' | 'announcement' | 'custom') => {
    const finalType = slideType || 'scripture';
    
    // Resolve active style preset
    let activePreset = presetScripture;
    if (finalType === 'song') activePreset = presetSong;
    else if (finalType === 'announcement') activePreset = presetAnnouncement;
    else if (finalType === 'custom') activePreset = presetCustom;

    let finalPayload: any = { 
      reference, 
      text, 
      translation,
      slideType: finalType,
      preset: activePreset
    };

    if (finalType === 'scripture' && isDualProjectionEnabled && secondaryTranslation && secondaryTranslation !== translation) {
      // Strip translation suffix like "Genesis 1:1 (KJV)" -> "Genesis 1:1"
      const cleanRef = reference.replace(/\s*\([^)]*\)\s*$/, '');
      try {
        const parsed = await window.api.parseReference(cleanRef);
        if (parsed) {
          const verses = await window.api.queryVerses({
            translation: secondaryTranslation,
            book: parsed.book,
            chapter: parsed.chapter,
            verseStart: parsed.verseStart,
            verseEnd: parsed.verseEnd
          });
          if (verses.length > 0) {
            const secondaryText = verses.map((v: any) => showVerseNumbers ? `[${v.verse}] ${v.text}` : v.text).join(' ');
            finalPayload.secondaryText = secondaryText;
            finalPayload.secondaryTranslation = secondaryTranslation;
          }
        }
      } catch (err) {
        console.error('[Console] Failed to resolve secondary translation:', err);
      }
    }

    window.api.forceProject(finalPayload);
  };

  const defaultPreset = {
    fontSizeScale: 1.0,
    projectionBgMode: 'global' as 'global' | 'color' | 'image' | 'gradient',
    projectionBgColor: '#000000',
    projectionBgGradient: 'twilight',
    projectionBgImage: '',
    projectionFontFamily: 'serif'
  };

  const updatePresetField = async (field: string, value: any) => {
    const key = `preset_${editingPresetCategory}`;
    const setter = 
      editingPresetCategory === 'scripture' ? setPresetScripture :
      editingPresetCategory === 'song' ? setPresetSong :
      editingPresetCategory === 'announcement' ? setPresetAnnouncement :
      setPresetCustom;

    const current = 
      editingPresetCategory === 'scripture' ? presetScripture :
      editingPresetCategory === 'song' ? presetSong :
      editingPresetCategory === 'announcement' ? presetAnnouncement :
      presetCustom;

    const currentObj = current || defaultPreset;
    const updated = { ...currentObj, [field]: value };
    
    setter(updated);
    if (window.api) {
      await window.api.setSettings(key as any, updated);
      
      // If we are currently projecting a slide of this category, update projection payload
      if (activeProjected && activeProjected.slideType === editingPresetCategory) {
        const updatedPayload = { ...activeProjected, preset: updated };
        window.api.forceProject(updatedPayload);
      }
    }
  };

  const handleAdjacentVerse = async (direction: 'next' | 'prev') => {
    if (!window.api || !activeProjected) return;

    // Strip translation suffix like "Genesis 1:1 (KJV)" -> "Genesis 1:1"
    const cleanRef = activeProjected.reference.replace(/\s*\([^)]*\)\s*$/, '');
    const parsed = await window.api.parseReference(cleanRef);
    if (!parsed) return;

    const currentVerse = direction === 'next'
      ? (parsed.verseEnd ?? parsed.verseStart ?? 1)
      : (parsed.verseStart ?? 1);

    const adjacent = await window.api.getAdjacentVerse({
      translation,
      book: parsed.book,
      chapter: parsed.chapter,
      verse: currentVerse,
      direction
    });

    if (adjacent) {
      const refFormatted = `${adjacent.book} ${adjacent.chapter}:${adjacent.verse} (${translation})`;
      const textCombined = showVerseNumbers ? `[${adjacent.verse}] ${adjacent.text}` : adjacent.text;
      project(refFormatted, textCombined);
    }
  };


  const addBookmark = (book: string, chapter: number, verseStart: number, verseEnd: number | undefined, _text: string) => {
    // Step 1: Set pending bookmark and pre-populate label with verse reference
    setPendingBookmark({ book, chapter, verseStart, verseEnd, text: _text });
    setBookmarkLabel(`${book} ${chapter}:${verseStart}`);
  };

  const confirmBookmark = async () => {
    if (!pendingBookmark || !window.api) return;
    const { book, chapter, verseStart, verseEnd } = pendingBookmark;
    await window.api.addBookmark({
      translation, book, chapter, verseStart, verseEnd,
      label: bookmarkLabel,
      createdAt: new Date().toISOString()
    });
    setBookmarksRefresh(prev => prev + 1);
    setRightTab('bookmarks');
    addAiLog('success', `Bookmark added for ${book} ${chapter}:${verseStart}`);
    setPendingBookmark(null);
    setBookmarkLabel('');
  };

  const addScheduleItem = (reference: string, text: string) => {
    setSchedule(prev => [...prev, { id: Math.random().toString(), reference, text }]);
    setRightTab('schedule');
  };

  const handleClear = () => {
    if (window.api) {
      window.api.clearProject();
      addAiLog('info', 'Cleared projector screen.');
    }
  };

  const handleToggleBlackout = () => {
    const nextBlackout = !blackout;
    setBlackout(nextBlackout);
    if (window.api) window.api.broadcastStatus({ blackout: nextBlackout });
  };

  const handleCustomImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1200;
        const MAX_HEIGHT = 1200;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.75);
          
          setProjectionBgImage(compressedBase64);
          setProjectionBgMode('image');
          if (window.api) {
            window.api.setSettings('projectionBgImage', compressedBase64);
            window.api.setSettings('projectionBgMode', 'image');
          }
          addAiLog('success', 'Custom background image applied successfully.');
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };


  const handleExportPDF = async () => {
    if (!window.api || history.length === 0) return;
    const success = await window.api.exportSessionPdf(history);
    if (success) addAiLog('success', 'Session log PDF exported successfully.');
  };

  return (
    <div className="h-screen w-screen bg-background text-foreground flex flex-col overflow-hidden">
      {/* Gap 5 — Bookmark Label Modal */}
      {pendingBookmark && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
          <div className="bg-card border border-border rounded-xl p-6 w-80 shadow-2xl">
            <h3 className="font-bold text-base mb-1">Add Bookmark</h3>
            <p className="text-xs text-muted-foreground mb-3">
              {pendingBookmark.book} {pendingBookmark.chapter}:{pendingBookmark.verseStart}
              {pendingBookmark.verseEnd ? '–' + pendingBookmark.verseEnd : ''}
            </p>
            <label className="text-xs font-semibold text-muted-foreground">Label</label>
            <input
              autoFocus
              type="text"
              value={bookmarkLabel}
              onChange={(e) => setBookmarkLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') confirmBookmark(); if (e.key === 'Escape') setPendingBookmark(null); }}
              className="w-full mt-1 mb-4 px-3 py-2 bg-background border border-border rounded text-sm outline-none focus:ring-2 focus:ring-primary/50"
              placeholder="e.g. Sunday sermon opening"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setPendingBookmark(null)} className="px-3 py-1.5 text-sm rounded border border-border hover:bg-secondary">Cancel</button>
              <button onClick={confirmBookmark} className="px-3 py-1.5 text-sm rounded bg-primary text-primary-foreground font-semibold hover:opacity-90">Save</button>
            </div>
          </div>
        </div>
      )}
      <header className="flex justify-between items-center px-6 py-4 border-b border-border bg-card shadow-sm z-10 shrink-0">
        <div className="flex items-center gap-3">
          {/* Church logo */}
          <img src="favicon.ico" alt="Church logo" className="w-9 h-9 rounded-md object-contain" />
          <div>
            <h1 className="font-extrabold tracking-tight text-xl">Scripture Presenter</h1>
            <p className="text-xs text-muted-foreground font-medium">Intelligent AV Automations</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {networkInfo && (
            <div className="hidden lg:flex items-center gap-2 border border-border px-3 py-1.5 rounded-md text-xs bg-muted/50 font-medium">
              <span className="w-2 h-2 rounded-full bg-gold shrink-0" />
              <span>LAN Remote: {networkInfo.ip}:{networkInfo.port}</span>
              <span className="text-muted-foreground">| PIN: <strong className="font-semibold text-gold">{networkInfo.pin}</strong></span>
            </div>
          )}
          {availableTranslations.length > 0 && (
            <div className="flex items-center gap-2 border border-border px-3 py-1.5 rounded-md text-xs bg-muted/50 font-medium">
              <span className="text-muted-foreground font-semibold">Version:</span>
              <select 
                value={translation} 
                onChange={async (e) => {
                  const newTrans = e.target.value;
                  setTranslation(newTrans);
                  if (window.api) {
                    await window.api.setSettings('selectedTranslation', newTrans);
                  }
                }} 
                className="bg-transparent font-bold text-primary border-none outline-none cursor-pointer focus:ring-0"
              >
                {availableTranslations.map(t => (
                  <option key={t.translation} value={t.translation} className="bg-card text-foreground">{t.translation}</option>
                ))}
              </select>
            </div>
          )}
          <button onClick={toggleTheme} className="p-2 hover:bg-secondary rounded-lg transition-colors border border-border">
            {isDarkMode ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4 text-primary" />}
          </button>
        </div>
      </header>

      <div className="flex-grow flex overflow-hidden">
        {/* LEFT PANE: Audio Monitoring & Speech */}
        <div className="w-[28%] border-r border-border bg-card flex flex-col justify-between overflow-hidden">
          <div className="p-5 border-b border-border space-y-4 shrink-0">
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-primary" /> Audio Capture
            </h3>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground font-semibold">Select Device</label>
              <select
                value={selectedAudioDevice}
                onChange={(e) => {
                  setSelectedAudioDevice(e.target.value);
                }}
                className="w-full text-sm bg-background border border-border rounded-md px-2.5 py-1.5 focus:ring-2 outline-none"
              >
                {audioInputDevices.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Mic ${d.deviceId.slice(0, 5)}`}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground font-semibold">
                <span>VU Volume Meter</span><span className="font-mono">{vuLevel}%</span>
              </div>
              <div className="w-full h-3 bg-muted rounded-full overflow-hidden flex gap-[2px] p-[1.5px]">
                {Array.from({ length: 20 }).map((_, idx) => {
                  const val = (idx + 1) * 5;
                  const active = vuLevel >= val;
                  let color = 'bg-primary';
                  if (val > 80) color = 'bg-rose-500';
                  else if (val > 65) color = 'bg-gold';
                  return <div key={idx} className={`flex-grow h-full transition-all ${active ? color : 'bg-muted-foreground/20'}`} />;
                })}
              </div>
            </div>

            {/* Noise Gate Controls */}
            <div className="space-y-2 pt-2 border-t border-border/50">
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground font-semibold">Audio Noise Gate</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isNoiseGateEnabled}
                    onChange={(e) => setIsNoiseGateEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-7 h-4 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-primary"></div>
                </label>
              </div>

              {isNoiseGateEnabled && (
                <div className="space-y-1 animate-in slide-in-from-top-1 duration-150">
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      Gate Status: 
                      {vuLevel > (noiseGateThreshold * 5000) ? (
                        <span className="text-emerald-500 font-bold flex items-center gap-0.5 animate-pulse">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          Open
                        </span>
                      ) : (
                        <span className="text-zinc-500 font-semibold flex items-center gap-0.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
                          Muted
                        </span>
                      )}
                    </span>
                    <span className="font-mono text-[9px] bg-muted px-1 rounded">Thresh: {noiseGateThreshold.toFixed(4)}</span>
                  </div>
                  <input
                    type="range"
                    min="0.0005"
                    max="0.0150"
                    step="0.0005"
                    value={noiseGateThreshold}
                    onChange={(e) => setNoiseGateThreshold(parseFloat(e.target.value))}
                    className="w-full accent-primary h-1 bg-muted rounded-lg appearance-none cursor-pointer"
                  />
                </div>
              )}
            </div>
            <button
              onClick={toggleMicrophone}
              className={`w-full py-2.5 rounded-md font-semibold text-sm flex items-center justify-center gap-2 transition-all ${
                isRecording ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-md' : 'bg-primary hover:bg-primary/90 text-primary-foreground'
              }`}
            >
              {isRecording
                ? <><MicOff className="w-4 h-4" /><span>Stop Listening [Space]</span></>
                : <><Mic className="w-4 h-4 animate-pulse" /><span>Start Listening [Space]</span></>
              }
            </button>
            {/* Speech engine progress card */}
            {speechEngineStatus !== 'ready' && speechEngineStatus !== 'idle' && !isRecording && (() => {
              // Parse percentage from detail strings like "Downloading model: 63%"
              const pctMatch = modelProgressDetail.match(/(\d+)%/);
              const pct = pctMatch ? parseInt(pctMatch[1], 10) : null;

              const isError = speechEngineStatus === 'error';
              const isLoading = speechEngineStatus === 'loading';
              const isDownloading = speechEngineStatus === 'downloading';

              return (
                <div className={`rounded-lg border px-3 py-2.5 text-xs space-y-1.5 ${
                  isError
                    ? 'border-destructive/40 bg-destructive/10'
                    : 'border-primary/20 bg-primary/5'
                }`}>
                  {/* Header row */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 font-semibold">
                      {isError && <span className="text-destructive">⚠</span>}
                      {isLoading && (
                        <svg className="w-3 h-3 animate-spin text-primary" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                        </svg>
                      )}
                      {isDownloading && <span className="text-primary">⬇</span>}
                      <span className={isError ? 'text-destructive' : 'text-foreground'}>
                        {isError ? 'Speech engine error' : isLoading ? 'Loading into memory…' : 'Downloading speech model'}
                      </span>
                    </div>
                    {pct !== null && (
                      <span className="font-mono font-bold text-primary tabular-nums">{pct}%</span>
                    )}
                  </div>

                  {/* Detail text */}
                  {modelProgressDetail && (
                    <p className={`text-[10px] truncate ${isError ? 'text-destructive/80' : 'text-muted-foreground'}`}>
                      {modelProgressDetail}
                    </p>
                  )}

                  {/* Progress bar */}
                  {(isDownloading || isLoading) && (
                    <div className="w-full h-1.5 bg-primary/15 rounded-full overflow-hidden">
                      {pct !== null ? (
                        <div
                          className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
                          style={{ width: `${pct}%` }}
                        />
                      ) : (
                        /* Indeterminate shimmer when no % available */
                        <div className="h-full w-1/3 bg-primary rounded-full animate-[shimmer_1.5s_ease-in-out_infinite]"
                          style={{
                            background: 'linear-gradient(90deg, transparent, hsl(var(--primary)), transparent)',
                            animation: 'shimmer 1.5s ease-in-out infinite',
                          }}
                        />
                      )}
                    </div>
                  )}

                  {/* One-time note */}
                  {isDownloading && (
                    <p className="text-[9px] text-muted-foreground/60">~290 MB · one-time download · cached locally after this</p>
                  )}
                </div>
              );
            })()}

          </div>
          <div className="flex-grow p-5 flex flex-col overflow-hidden">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Live Transcription</h3>
              {transcript && (
                <button
                  onClick={() => {
                    setTranscript('');
                    setDetectedRefs([]);
                    rollingWindowRef.current = [];
                    if (subtitleTimeoutRef.current) clearTimeout(subtitleTimeoutRef.current);
                    setIsFading(false);
                  }}
                  className="text-[10px] text-muted-foreground hover:text-destructive transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="flex-grow overflow-y-auto border border-border bg-background rounded-md p-4 custom-scrollbar text-sm font-mono leading-relaxed">
              {transcript || interimTranscript ? (
                <div className={`transition-opacity duration-500 ${isFading ? 'opacity-0' : 'opacity-100'}`}>
                  <HighlightedTranscript text={transcript} detectedRefs={detectedRefs} />
                  {interimTranscript && (
                    <span className="text-muted-foreground/70 italic"> {interimTranscript}</span>
                  )}
                </div>
              ) : (
                <p className="text-muted-foreground/50 italic text-center py-12">Start speaking to capture transcripts...</p>
              )}
            </div>
          </div>
        </div>

        {/* MIDDLE PANE: Preview + Content Tabs */}
        <div className="flex-grow bg-background flex flex-col overflow-hidden border-r border-border">
          {/* Mini Projector Preview */}
          <div className="p-4 border-b border-border flex flex-col gap-3 shrink-0">
            {(() => {
              const activePreset = activeProjected?.preset;
              const useGlobalBg = !activePreset?.projectionBgMode || activePreset.projectionBgMode === 'global';
              const previewBgMode = useGlobalBg ? projectionBgMode : activePreset.projectionBgMode;
              const previewBgColor = useGlobalBg ? projectionBgColor : activePreset.projectionBgColor;
              const previewBgImage = useGlobalBg ? projectionBgImage : (activePreset.projectionBgImage || projectionBgImage);
              const previewBgGradient = useGlobalBg ? projectionBgGradient : activePreset.projectionBgGradient;
              const previewFontFamily = activePreset?.projectionFontFamily ?? projectionFontFamily;
              const previewFontSizeScale = activePreset?.fontSizeScale ?? fontSizeScale;

              return (
                <div className="relative aspect-video w-full max-w-[480px] mx-auto bg-black text-white rounded-lg border border-border flex flex-col justify-between p-3 select-none overflow-hidden"
                     style={{ backgroundColor: previewBgColor }}>
                  {/* Background Image Layer inside Preview */}
                  {previewBgMode === 'image' && previewBgImage && (
                    <div 
                      className="absolute inset-0 bg-cover bg-center transition-all duration-500 z-0 pointer-events-none"
                      style={{ backgroundImage: `url(${previewBgImage})` }}
                    >
                      <div className="absolute inset-0 bg-black/45" />
                    </div>
                  )}
                  {/* Animated HSL Gradient Layer inside Preview */}
                  {previewBgMode === 'gradient' && (
                    <div 
                      className={`absolute inset-0 transition-all duration-500 z-0 pointer-events-none ${
                        previewBgGradient === 'twilight' ? 'gradient-twilight' :
                        previewBgGradient === 'aurora' ? 'gradient-aurora' :
                        previewBgGradient === 'forest' ? 'gradient-forest' :
                        previewBgGradient === 'golden' ? 'gradient-golden' : ''
                      }`}
                    >
                      <div className="absolute inset-0 bg-black/20" />
                    </div>
                  )}
                  {blackout && (
                    <div className="absolute inset-0 bg-black z-20 flex items-center justify-center border-4 border-destructive rounded-lg">
                      <div className="text-center text-destructive font-extrabold uppercase tracking-widest"><AlertTriangle className="w-8 h-8 mx-auto mb-1" /> BLACKOUT</div>
                    </div>
                  )}
                  {activeProjected ? (
                    <div className="flex flex-col h-full justify-between z-10 relative">
                      <div className="flex justify-between items-center text-[10px] opacity-55 border-b border-white/20 pb-1 font-bold">
                        <div className="flex items-center gap-1.5">
                          <img src="favicon.ico" alt="" className="w-3.5 h-3.5 object-contain" />
                          <span>PRESENTER</span>
                        </div>
                        <span>{activeProjected.translation}{activeProjected.secondaryTranslation ? ` + ${activeProjected.secondaryTranslation}` : ''}</span>
                      </div>
                      <div className="flex-grow flex flex-col items-center justify-center px-4 gap-1 overflow-y-auto">
                        {/* Primary Text */}
                        <p
                          className="text-center font-medium"
                          style={{
                            fontSize: `calc(11px * ${previewFontSizeScale})`,
                            fontFamily:
                              previewFontFamily === 'cinzel'           ? '"Cinzel", serif' :
                              previewFontFamily === 'eb-garamond'      ? '"EB Garamond", serif' :
                              previewFontFamily === 'lora'             ? '"Lora", serif' :
                              previewFontFamily === 'playfair-display' ? '"Playfair Display", serif' :
                              previewFontFamily === 'raleway'          ? '"Raleway", sans-serif' :
                              previewFontFamily === 'inter'            ? '"Inter", sans-serif' :
                              previewFontFamily === 'sans-serif'       ? 'system-ui, sans-serif' :
                              'Georgia, serif',
                            fontStyle:
                              previewFontFamily === 'raleway' ||
                              previewFontFamily === 'inter' ||
                              previewFontFamily === 'cinzel' ||
                              previewFontFamily === 'sans-serif'
                                ? 'normal' : 'italic'
                          }}
                        >
                          &ldquo;{activeProjected.text}&rdquo;
                        </p>

                        {/* Secondary Text */}
                        {activeProjected.secondaryText && (
                          <>
                            <div className="w-8 border-t border-white/20 my-0.5" />
                            <p
                              className="text-center text-zinc-300 opacity-85"
                              style={{
                                fontSize: `calc(9px * ${previewFontSizeScale})`,
                                fontFamily:
                                  previewFontFamily === 'cinzel'           ? '"Cinzel", serif' :
                                  previewFontFamily === 'eb-garamond'      ? '"EB Garamond", serif' :
                                  previewFontFamily === 'lora'             ? '"Lora", serif' :
                                  previewFontFamily === 'playfair-display' ? '"Playfair Display", serif' :
                                  previewFontFamily === 'raleway'          ? '"Raleway", sans-serif' :
                                  previewFontFamily === 'inter'            ? '"Inter", sans-serif' :
                                  previewFontFamily === 'sans-serif'       ? 'system-ui, sans-serif' :
                                  'Georgia, serif',
                                fontStyle: 'italic'
                              }}
                            >
                              &ldquo;{activeProjected.secondaryText}&rdquo; <span className="text-[7px] not-italic opacity-60 font-semibold font-sans">({activeProjected.secondaryTranslation})</span>
                            </p>
                          </>
                        )}
                      </div>
                      <div className="flex justify-center border-t border-white/20 pt-1 text-[11px] font-bold text-gold"
                           style={{
                             fontFamily:
                               previewFontFamily === 'cinzel'           ? '"Cinzel", serif' :
                               previewFontFamily === 'eb-garamond'      ? '"EB Garamond", serif' :
                               previewFontFamily === 'lora'             ? '"Lora", serif' :
                               previewFontFamily === 'playfair-display' ? '"Playfair Display", serif' :
                               previewFontFamily === 'raleway'          ? '"Raleway", sans-serif' :
                               previewFontFamily === 'inter'            ? '"Inter", sans-serif' :
                               previewFontFamily === 'sans-serif'       ? 'system-ui, sans-serif' :
                               'Georgia, serif'
                           }}>
                        {activeProjected.reference}
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col h-full items-center justify-center text-white/30 text-xs"><Tv className="w-5 h-5 mb-1" /> NO SCRIPTURE</div>
                  )}
                </div>
              );
            })()}
            <div className="flex justify-center gap-2">
              <button 
                onClick={() => handleAdjacentVerse('prev')}
                disabled={!activeProjected}
                className="px-2.5 py-1.5 border rounded text-xs font-semibold hover:bg-secondary disabled:opacity-40 disabled:pointer-events-none flex gap-1 items-center"
                title="Previous Verse (Left Arrow)"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Prev
              </button>
              <button onClick={handleClear} className="px-3 py-1.5 border rounded text-xs font-semibold hover:bg-secondary flex gap-1 items-center"><Trash2 className="w-3.5 h-3.5" /> Clear</button>
              <button onClick={handleToggleBlackout} className={`px-3 py-1.5 border rounded text-xs font-semibold flex gap-1 items-center ${blackout ? 'bg-destructive text-white border-destructive' : 'hover:bg-secondary'}`}><Power className="w-3.5 h-3.5" /> Blackout</button>
              <button 
                onClick={() => handleAdjacentVerse('next')}
                disabled={!activeProjected}
                className="px-2.5 py-1.5 border rounded text-xs font-semibold hover:bg-secondary disabled:opacity-40 disabled:pointer-events-none flex gap-1 items-center"
                title="Next Verse (Right Arrow)"
              >
                Next <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* AI Suggestion Banner */}
          {aiSuggestion && (
            <div className="bg-gold/10 border-b border-gold/30 p-3 flex justify-between items-center shrink-0 animate-in slide-in-from-top-1">
              <div className="flex gap-2 items-center text-sm">
                <Info className="w-4 h-4 text-gold" />
                <span className="font-semibold text-gold">{aiSuggestion.reference}</span>
                <span className="text-muted-foreground truncate max-w-sm">"{aiSuggestion.text}"</span>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setAiSuggestion(null)} className="px-3 py-1 text-xs font-medium hover:bg-secondary rounded">Dismiss</button>
                <button onClick={() => { project(aiSuggestion.reference, aiSuggestion.text); setAiSuggestion(null); }} className="px-3 py-1 text-xs font-bold bg-gold text-gold-foreground rounded hover:opacity-90">Project</button>
              </div>
            </div>
          )}

          {/* Middle Tabs Nav */}
          <div className="flex border-b border-border bg-muted/20 shrink-0">
            <button onClick={() => setMiddleTab('browser')} className={`px-4 py-2 text-sm font-semibold border-b-2 flex gap-1 items-center transition-colors ${middleTab === 'browser' ? 'border-primary text-primary bg-background' : 'border-transparent text-muted-foreground hover:bg-muted/50'}`}><BookOpen className="w-4 h-4" /> Browser</button>
            <button onClick={() => setMiddleTab('search')} className={`px-4 py-2 text-sm font-semibold border-b-2 flex gap-1 items-center transition-colors ${middleTab === 'search' ? 'border-primary text-primary bg-background' : 'border-transparent text-muted-foreground hover:bg-muted/50'}`}><SearchIcon className="w-4 h-4" /> Search</button>
            <button onClick={() => setMiddleTab('manual')} className={`px-4 py-2 text-sm font-semibold border-b-2 flex gap-1 items-center transition-colors ${middleTab === 'manual' ? 'border-primary text-primary bg-background' : 'border-transparent text-muted-foreground hover:bg-muted/50'}`}><Send className="w-4 h-4" /> Manual</button>
            <button onClick={() => setMiddleTab('ai')} className={`px-4 py-2 text-sm font-semibold border-b-2 flex gap-1 items-center transition-colors ${middleTab === 'ai' ? 'border-gold text-gold bg-background' : 'border-transparent text-muted-foreground hover:bg-muted/50'}`}><CheckCircle className="w-4 h-4" /> AI Logs</button>
          </div>

          {/* Middle Content */}
          <div className="flex-grow overflow-hidden bg-background">
            {middleTab === 'browser' && <BibleBrowser translation={translation} showVerseNumbers={showVerseNumbers} onProject={project} onAddBookmark={addBookmark} onAddSchedule={addScheduleItem} />}
            {middleTab === 'search' && <SearchPanel translation={translation} showVerseNumbers={showVerseNumbers} onProject={project} onAddBookmark={addBookmark} onAddSchedule={addScheduleItem} />}
            {middleTab === 'manual' && (
              <div className="p-6">
                <form onSubmit={handleManualSearch} className="flex gap-2">
                  <input type="text" placeholder="Enter reference (e.g. John 3:16)" value={manualReference} onChange={(e) => setManualReference(e.target.value)} className="flex-grow px-3 py-2 bg-card border rounded text-sm outline-none focus:ring-2 focus:ring-primary/50" />
                  <button type="submit" className="bg-primary text-primary-foreground px-4 py-2 rounded text-sm font-bold">Project</button>
                </form>
                {manualError && <p className="text-xs text-destructive mt-2">{manualError}</p>}
              </div>
            )}
            {middleTab === 'ai' && (
              <div className="p-4 h-full flex flex-col overflow-hidden">
                <div className="flex-grow overflow-y-auto border bg-card rounded p-3 space-y-2 text-xs font-mono custom-scrollbar">
                  {aiLogs.length > 0 ? aiLogs.map(log => (
                    <div key={log.id} className="flex gap-2 py-0.5">
                      <span className="text-muted-foreground">[{log.timestamp}]</span>
                      <span className={log.type === 'error' ? 'text-rose-500' : log.type === 'success' ? 'text-emerald-500' : log.type === 'warning' ? 'text-amber-500' : 'text-blue-500'}>{log.message}</span>
                    </div>
                  )) : <div className="text-muted-foreground text-center py-4">No AI logs.</div>}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT PANE: Schedule & Settings */}
        <div className="w-[30%] bg-card flex flex-col overflow-hidden">
          <div className="flex border-b border-border bg-muted/20 shrink-0">
            <button onClick={() => setRightTab('schedule')} className={`flex-1 py-2 text-xs font-bold border-b-2 uppercase tracking-wider transition-colors ${rightTab === 'schedule' ? 'border-primary text-primary bg-background' : 'border-transparent text-muted-foreground hover:bg-muted/50'}`}>Schedule</button>
            <button onClick={() => setRightTab('bookmarks')} className={`flex-1 py-2 text-xs font-bold border-b-2 uppercase tracking-wider transition-colors ${rightTab === 'bookmarks' ? 'border-gold text-gold bg-background' : 'border-transparent text-muted-foreground hover:bg-muted/50'}`}>Favs</button>
            <button onClick={() => setRightTab('history')} className={`flex-1 py-2 text-xs font-bold border-b-2 uppercase tracking-wider transition-colors ${rightTab === 'history' ? 'border-primary text-primary bg-background' : 'border-transparent text-muted-foreground hover:bg-muted/50'}`}>Hist</button>
            <button onClick={() => setRightTab('settings')} className={`flex-1 py-2 text-xs font-bold border-b-2 uppercase tracking-wider transition-colors ${rightTab === 'settings' ? 'border-primary text-primary bg-background' : 'border-transparent text-muted-foreground hover:bg-muted/50'}`}>Settings</button>
          </div>

          <div className="flex-grow overflow-hidden">
            {rightTab === 'schedule' && <ServiceSchedule schedule={schedule} setSchedule={setSchedule} onProject={project} />}
            {rightTab === 'bookmarks' && <BookmarksPanel onProject={project} onAddSchedule={addScheduleItem} refreshTrigger={bookmarksRefresh} showVerseNumbers={showVerseNumbers} />}
            
            {rightTab === 'history' && (
              <div className="h-full flex flex-col">
                <div className="p-3 border-b flex justify-between items-center bg-muted/30">
                  <span className="text-xs font-bold uppercase text-muted-foreground">Session History</span>
                  {history.length > 0 && (
                    <div className="flex gap-2">
                      <button onClick={handleExportPDF} className="text-xs text-primary hover:underline">Export PDF</button>
                      <span className="text-muted-foreground text-xs">|</span>
                      <button onClick={() => setHistory([])} className="text-xs text-destructive hover:underline">Clear</button>
                    </div>
                  )}
                </div>
                <div className="flex-grow overflow-y-auto p-2 space-y-1 custom-scrollbar">
                  {history.length > 0 ? history.map((item, idx) => (
                    <div key={idx} onClick={() => project(item.reference, item.text)} className="p-2 hover:bg-secondary rounded cursor-pointer">
                      <div className="flex justify-between"><span className="text-xs font-bold text-gold">{item.reference}</span><span className="text-[10px] text-muted-foreground">{item.timestamp}</span></div>
                      <p className="text-xs text-muted-foreground line-clamp-1 mt-1">"{item.text}"</p>
                    </div>
                  )) : <p className="text-xs text-center p-4 text-muted-foreground">No history</p>}
                </div>
              </div>
            )}

            {rightTab === 'settings' && (
              <div className="h-full overflow-y-auto p-4 space-y-5 custom-scrollbar bg-background">
                <div className="space-y-4">
                  <h3 className="text-xs font-bold uppercase text-muted-foreground border-b pb-1">Translation Manager</h3>
                  
                  <div className="space-y-3">
                    <div className="flex items-center justify-between border-b border-border/50 pb-2">
                      <label className="text-xs font-semibold text-foreground">Enable Parallel Dual-Translation</label>
                      <input 
                        type="checkbox" 
                        checked={isDualProjectionEnabled} 
                        onChange={async (e) => {
                          const val = e.target.checked;
                          setIsDualProjectionEnabled(val);
                          if (window.api) {
                            await window.api.setSettings('isDualProjectionEnabled', val);
                          }
                        }}
                        className="h-4 w-4 bg-card border rounded accent-primary outline-none cursor-pointer"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-muted-foreground uppercase">Primary Translation</label>
                      <select 
                        value={translation} 
                        onChange={async (e) => {
                          const newTrans = e.target.value;
                          setTranslation(newTrans);
                          if (window.api) {
                            await window.api.setSettings('selectedTranslation', newTrans);
                          }
                        }} 
                        className="w-full text-xs p-2 bg-card border rounded outline-none focus:ring-1"
                      >
                        {availableTranslations.length > 0 ? availableTranslations.map(t => (
                          <option key={t.translation} value={t.translation}>{t.translation} ({t.verseCount} verses)</option>
                        )) : <option value="KJV">KJV (Installed)</option>}
                      </select>
                    </div>

                    {isDualProjectionEnabled && (
                      <div className="space-y-1 animate-in fade-in duration-200">
                        <label className="text-[11px] font-bold text-muted-foreground uppercase">Secondary Translation</label>
                        <select 
                          value={secondaryTranslation} 
                          onChange={async (e) => {
                            const newTrans = e.target.value;
                            setSecondaryTranslation(newTrans);
                            if (window.api) {
                              await window.api.setSettings('secondaryTranslation', newTrans);
                            }
                          }} 
                          className="w-full text-xs p-2 bg-card border rounded outline-none focus:ring-1"
                        >
                          <option value="">-- Select Secondary --</option>
                          {availableTranslations.filter(t => t.translation !== translation).map(t => (
                            <option key={t.translation} value={t.translation}>{t.translation}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 pt-2">
                    <label className="text-xs font-semibold text-foreground">Installed Databases</label>
                    <div className="space-y-1">
                      {availableTranslations.map(t => (
                        <div key={t.translation} className="flex justify-between items-center bg-muted/30 p-2 rounded border border-border">
                          <span className="text-xs font-bold">{t.translation}</span>
                          <button 
                            onClick={async () => {
                              if (confirm(`Delete ${t.translation}?`)) {
                                const ok = await window.api.deleteTranslation(t.translation);
                                if (ok) {
                                  window.api.getTranslations().then(setAvailableTranslations);
                                  addAiLog('info', `Deleted translation ${t.translation}`);
                                } else {
                                  addAiLog('warning', `Could not delete ${t.translation} (might be the last one)`);
                                }
                              }
                            }}
                            className="text-xs text-destructive hover:underline"
                          >
                            Delete
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-border/50">
                    <label className="text-xs font-semibold text-foreground">Available Catalog (One-click Install)</label>
                    <div className="space-y-1 max-h-[160px] overflow-y-auto custom-scrollbar border p-1 rounded bg-muted/10">
                      {catalog.map(item => (
                        <div key={item.code} className="flex justify-between items-center bg-card p-1.5 rounded border border-border/80 text-[10px] my-0.5">
                          <div className="flex flex-col">
                            <span className="font-semibold text-foreground">{item.code} - {item.name}</span>
                            <span className="text-[8px] text-muted-foreground">{item.isInstalled ? 'Installed' : 'Public Domain'}</span>
                          </div>
                          <div>
                            {item.isInstalled ? (
                              <button 
                                onClick={async () => {
                                  if (confirm(`Uninstall ${item.code}?`)) {
                                    addAiLog('info', `Uninstalling ${item.code}...`);
                                    const ok = await window.api.deleteTranslation(item.code);
                                    if (ok) {
                                      addAiLog('success', `Uninstalled ${item.code}`);
                                      window.api.getTranslations().then(setAvailableTranslations);
                                    } else {
                                      addAiLog('error', `Failed to uninstall ${item.code}`);
                                    }
                                  }
                                }}
                                className="text-[8px] text-destructive hover:underline font-bold"
                              >
                                Uninstall
                              </button>
                            ) : (
                              <button 
                                onClick={async () => {
                                  addAiLog('info', `Downloading & Installing ${item.code} (from GitHub Catalog)...`);
                                  const res = await window.api.downloadTranslation(item.code, item.url);
                                  if (res === true) {
                                    addAiLog('success', `Installed ${item.code}!`);
                                    window.api.getTranslations().then(setAvailableTranslations);
                                  } else if (res && (res as any).error) {
                                    addAiLog('error', `Failed to install ${item.code}: ${(res as any).error}`);
                                  } else {
                                    addAiLog('error', `Failed to install ${item.code}`);
                                  }
                                }}
                                className="text-[8px] bg-primary/10 text-primary hover:bg-primary/20 px-1.5 py-0.5 rounded font-bold border border-primary/20"
                              >
                                Install
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-border/50">
                    <label className="text-xs font-semibold text-foreground">Download Free Bibles (Requires Internet)</label>
                    <div className="grid grid-cols-5 gap-1.5">
                      {/* ── Core translations ── */}
                      {[
                        { code: 'NIV',     url: 'NIV.json',     label: 'NIV',     hint: '~7 MB' },
                        { code: 'NIV2011', url: 'NIV2011.json', label: 'NIV 2011', hint: '~7 MB' },
                        { code: 'NKJV',    url: 'NKJV.json',    label: 'NKJV',    hint: '~10 MB' },
                        { code: 'ESV',     url: 'ESV.json',     label: 'ESV',     hint: '~10 MB' },
                        { code: 'NLT',     url: 'NLT.json',     label: 'NLT',     hint: '~9 MB' },
                        { code: 'NASB',    url: 'NASB.json',    label: 'NASB',    hint: '~10 MB' },
                        { code: 'AMP',     url: 'AMP.json',     label: 'AMP',     hint: '~11 MB' },
                        { code: 'MSG',     url: 'MSG.json',     label: 'MSG',     hint: '~5 MB' },
                        { code: 'CSB17',   url: 'CSB17.json',   label: 'CSB',     hint: '~10 MB' },
                        { code: 'BBE',     url: 'BBE.json',     label: 'BBE',     hint: '~4 MB', isGh: true },
                      ].map(t => (
                        <button
                          key={t.code}
                          onClick={async () => {
                            const fullUrl = t.isGh
                              ? 'https://raw.githubusercontent.com/thiagobodruk/bible/master/json/en_bbe.json'
                              : `https://bolls.life/static/translations/${t.url}`;
                            addAiLog('info', `Downloading ${t.label} (${t.hint}, please wait)…`);
                            const res = await window.api.downloadTranslation(t.code, fullUrl);
                            if (res === true) {
                              addAiLog('success', `${t.label} Downloaded & Installed!`);
                              window.api.getTranslations().then(setAvailableTranslations);
                            } else {
                              addAiLog('error', `${t.label} failed: ${(res as any)?.error}`);
                            }
                          }}
                          className="p-1.5 text-[11px] border rounded bg-secondary hover:bg-muted text-center leading-tight"
                        >{t.label}</button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-border/50">
                    <label className="text-xs font-semibold text-foreground">Import Custom Bible (JSON File)</label>
                    <button 
                      onClick={async () => {
                        const code = prompt("Enter abbreviation for this translation (e.g. NKJV):");
                        if (!code) return;
                        addAiLog('info', `Importing ${code.toUpperCase()}...`);
                        const res = await window.api.importTranslationFile(code.toUpperCase());
                        if (res === true) {
                          addAiLog('success', `${code.toUpperCase()} Imported & Installed!`);
                          window.api.getTranslations().then(setAvailableTranslations);
                        } else if (res && (res as any).error) {
                          addAiLog('error', `Import failed: ${(res as any).error}`);
                        } else {
                          addAiLog('info', 'Import cancelled.');
                        }
                      }}
                      className="w-full py-1.5 text-xs border border-primary text-primary font-bold rounded hover:bg-primary/10 transition-colors"
                    >
                      Browse for JSON File...
                    </button>
                    <p className="text-[10px] text-muted-foreground leading-tight">Must be a valid JSON array of verses or a ThiagoBodruk format JSON file.</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-xs font-bold uppercase text-muted-foreground border-b pb-1">Network & Remote</h3>
                  {networkInfo ? (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">LAN Remote: <strong>{networkInfo.ip}:{networkInfo.port}</strong> | PIN: <strong className="text-primary">{networkInfo.pin}</strong></p>
                      {qrDataUrl && (
                        <div className="mt-3">
                          <p className="text-xs text-muted-foreground font-semibold mb-1">Scan to connect mobile remote:</p>
                          <img src={qrDataUrl} alt="QR Code for mobile remote" className="w-32 h-32 rounded border border-border" />
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Network info unavailable.</p>
                  )}
                </div>

                <div className="space-y-3">
                  <h3 className="text-xs font-bold uppercase text-muted-foreground border-b pb-1">AI & Speech Detection</h3>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-foreground">Anthropic API Key</label>
                    {envKeyActive ? (
                      <div className="flex items-center gap-2 px-2 py-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded text-xs text-emerald-600 dark:text-emerald-400">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                        <span>API key loaded from <code className="font-mono">.env</code> — not visible for security</span>
                      </div>
                    ) : (
                      <input
                        type="password"
                        value={apiKey}
                        onChange={e => setApiKey(e.target.value)}
                        onBlur={e => { if (window.api) window.api.setSettings('anthropicApiKey', e.target.value); }}
                        placeholder="sk-ant-… (or add to .env file)"
                        className="w-full text-xs px-2 py-1.5 bg-card border rounded outline-none focus:ring-1 font-mono"
                      />
                    )}
                    <p className="text-[10px] text-muted-foreground">
                      {envKeyActive
                        ? 'To change the key, edit the .env file in the project root.'
                        : 'Required for automatic scripture detection. Or add ANTHROPIC_API_KEY to .env for better security.'}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-foreground flex justify-between items-center">
                      <span>Groq API Key</span>
                      <a href="https://console.groq.com" target="_blank" rel="noreferrer" className="text-[10px] text-primary hover:underline font-normal">Get Free Key</a>
                    </label>
                    {groqEnvKeyActive ? (
                      <div className="flex items-center gap-2 px-2 py-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded text-xs text-emerald-600 dark:text-emerald-400">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                        <span>API key loaded from <code className="font-mono">.env</code> — not visible for security</span>
                      </div>
                    ) : (
                      <input
                        type="password"
                        value={groqApiKey}
                        onChange={e => setGroqApiKey(e.target.value)}
                        onBlur={e => { if (window.api) window.api.setSettings('groqApiKey', e.target.value); }}
                        placeholder="gsk_… (or add to .env file)"
                        className="w-full text-xs px-2 py-1.5 bg-card border rounded outline-none focus:ring-1 font-mono"
                      />
                    )}
                    <p className="text-[10px] text-muted-foreground">
                      {groqEnvKeyActive
                        ? 'To change the key, edit the .env file in the project root.'
                        : 'Required for Whisper speech-to-text transcription. Or add GROQ_API_KEY to .env for better security.'}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-foreground">Detection Mode</label>
                    <select
                      value={aiMode}
                      onChange={e => {
                        const val = e.target.value;
                        setAiMode(val);
                        if (window.api) window.api.setSettings('aiMode', val);
                      }}
                      className="w-full text-xs p-2 bg-card border rounded outline-none"
                    >
                      <option value="auto-project">Auto-Project — project instantly when detected</option>
                      <option value="suggest-only">Suggest Only — show banner, operator confirms</option>
                    </select>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-border/50">
                    <label className="text-xs font-semibold text-foreground">Active Speech Model</label>
                    <select
                      value={speechModelsStatus.activeModel}
                      onChange={e => handleSelectSpeechModel(e.target.value)}
                      className="w-full text-xs p-2 bg-card border rounded outline-none"
                    >
                      {[
                        { id: 'Xenova/whisper-tiny.en', label: 'Tiny (English-only) ~75MB' },
                        { id: 'Xenova/whisper-tiny', label: 'Tiny (Multilingual) ~75MB' },
                        { id: 'Xenova/whisper-base.en', label: 'Base (English-only) ~145MB' },
                        { id: 'Xenova/whisper-base', label: 'Base (Multilingual) ~145MB' },
                        { id: 'Xenova/whisper-small.en', label: 'Small (English-only) ~480MB' }
                      ].map(m => (
                        <option key={m.id} value={m.id}>{m.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2 pt-1 pb-2">
                    <label className="text-[11px] font-bold text-muted-foreground uppercase">Local Models Cache</label>
                    <div className="space-y-1 max-h-[140px] overflow-y-auto custom-scrollbar border p-1 rounded bg-muted/10">
                      {[
                        { id: 'Xenova/whisper-tiny.en', label: 'Tiny (English)' },
                        { id: 'Xenova/whisper-tiny', label: 'Tiny (Multilingual)' },
                        { id: 'Xenova/whisper-base.en', label: 'Base (English)' },
                        { id: 'Xenova/whisper-base', label: 'Base (Multilingual)' },
                        { id: 'Xenova/whisper-small.en', label: 'Small (English)' }
                      ].map(m => {
                        const isDownloaded = speechModelsStatus.downloaded.includes(m.id);
                        const isActive = speechModelsStatus.activeModel === m.id;
                        return (
                          <div key={m.id} className="flex justify-between items-center bg-card p-1.5 rounded border border-border/80 text-[10px]">
                            <div className="flex flex-col">
                              <span className="font-semibold text-foreground">{m.label}</span>
                              <span className="text-[9px] text-muted-foreground">{isActive ? 'Active' : isDownloaded ? 'Offline Ready' : 'Not Cached'}</span>
                            </div>
                            <div className="flex gap-2">
                              {!isDownloaded && (
                                <button
                                  onClick={() => handleSelectSpeechModel(m.id)}
                                  className="text-[8px] bg-primary/10 text-primary hover:bg-primary/20 px-1.5 py-0.5 rounded font-bold border border-primary/20"
                                >
                                  Pre-load
                                </button>
                              )}
                              {isDownloaded && !isActive && (
                                <button
                                  onClick={() => handleDeleteSpeechModel(m.id)}
                                  className="text-[8px] text-destructive hover:underline font-bold"
                                >
                                  Delete
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-1 border-t border-border/50 pt-2">
                    <label className="text-xs font-semibold text-foreground">Whisper Server URL</label>
                    <input
                      type="text"
                      value={whisperUrl}
                      onChange={e => setWhisperUrl(e.target.value)}
                      onBlur={e => { if (window.api) window.api.setSettings('whisperUrl', e.target.value); }}
                      placeholder="http://localhost:8080"
                      className="w-full text-xs px-2 py-1.5 bg-card border rounded outline-none focus:ring-1 font-mono"
                    />
                    <p className="text-[10px] text-muted-foreground">Used when Web Speech API is unavailable (most Electron environments).</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-xs font-bold uppercase text-muted-foreground border-b pb-1">Projection Display</h3>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-foreground flex justify-between">Font Size Scale <span className="text-primary font-bold">{fontSizeScale.toFixed(1)}x</span></label>
                    <input
                      type="range"
                      min="0.5"
                      max="2.0"
                      step="0.1"
                      value={fontSizeScale}
                      onChange={e => {
                        const val = parseFloat(e.target.value);
                        setFontSizeScale(val);
                        // Broadcast immediately for real-time preview on projection screen
                        if (window.api) {
                          window.api.setSettings('fontSizeScale', val);
                          window.api.broadcastStatus({ fontSizeScale: val });
                        }
                      }}
                      className="w-full accent-primary"
                    />
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>0.5x (Smaller)</span>
                      <span>1.0x (Default)</span>
                      <span>2.0x (Larger)</span>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-foreground">Background Style</label>
                    <div className="flex bg-muted/50 p-0.5 rounded-md border border-border">
                      <button
                        type="button"
                        onClick={() => {
                          setProjectionBgMode('color');
                          if (window.api) {
                            window.api.setSettings('projectionBgMode', 'color');
                            window.api.broadcastStatus({ projectionBgMode: 'color' });
                          }
                        }}
                        className={`flex-1 py-1 text-[11px] font-bold rounded transition-all ${
                          projectionBgMode === 'color' ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        Solid Color
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setProjectionBgMode('image');
                          if (window.api) {
                            window.api.setSettings('projectionBgMode', 'image');
                            window.api.broadcastStatus({ projectionBgMode: 'image' });
                          }
                        }}
                        className={`flex-1 py-1 text-[11px] font-bold rounded transition-all ${
                          projectionBgMode === 'image' ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        Image
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setProjectionBgMode('gradient');
                          if (window.api) {
                            window.api.setSettings('projectionBgMode', 'gradient');
                            window.api.setSettings('projectionBgGradient', projectionBgGradient);
                            window.api.broadcastStatus({ 
                              projectionBgMode: 'gradient',
                              projectionBgGradient: projectionBgGradient
                            });
                          }
                        }}
                        className={`flex-1 py-1 text-[11px] font-bold rounded transition-all ${
                          projectionBgMode === 'gradient' ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        Animated HSL
                      </button>
                    </div>
                  </div>

                  {projectionBgMode === 'color' && (
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-foreground">Background Color</label>
                      <div className="flex gap-2">
                        <input type="color" value={projectionBgColor} onChange={e => {
                          setProjectionBgColor(e.target.value);
                          if (window.api) {
                            window.api.setSettings('projectionBgColor', e.target.value);
                            window.api.broadcastStatus({ projectionBgColor: e.target.value });
                          }
                        }} className="w-8 h-8 rounded border p-0 cursor-pointer" />
                        <input type="text" value={projectionBgColor} onChange={e => {
                          setProjectionBgColor(e.target.value);
                          if (window.api) {
                            window.api.setSettings('projectionBgColor', e.target.value);
                            window.api.broadcastStatus({ projectionBgColor: e.target.value });
                          }
                        }} className="w-full text-xs px-2 bg-card border rounded" />
                      </div>
                    </div>
                  )}

                  {projectionBgMode === 'gradient' && (
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-foreground">Select Animated HSL Gradient</label>
                      <div className="grid grid-cols-2 gap-2">
                        {GRADIENT_THEMES.map((theme) => {
                          const isActive = projectionBgGradient === theme.id;
                          return (
                            <button
                              type="button"
                              key={theme.id}
                              onClick={() => {
                                setProjectionBgGradient(theme.id);
                                if (window.api) {
                                  window.api.setSettings('projectionBgGradient', theme.id);
                                  window.api.setSettings('projectionBgMode', 'gradient');
                                  window.api.broadcastStatus({ 
                                    projectionBgMode: 'gradient',
                                    projectionBgGradient: theme.id 
                                  });
                                }
                              }}
                              className={`relative p-3 rounded overflow-hidden border-2 text-left transition-all h-16 flex flex-col justify-end ${
                                isActive ? 'border-primary shadow-sm ring-1 ring-primary/20 scale-[1.02]' : 'border-border/60 hover:border-border'
                              }`}
                              style={{ background: theme.previewStyle }}
                            >
                              <span className="text-xs font-bold text-white drop-shadow-md select-none leading-tight">
                                {theme.name}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {projectionBgMode === 'image' && (
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-foreground">Select Background Image</label>
                      <div className="grid grid-cols-5 gap-1.5">
                        {BACKGROUND_THEMES.map((theme) => {
                          const isActive = projectionBgImage === theme.url;
                          return (
                            <button
                              type="button"
                              key={theme.id}
                              onClick={() => {
                                setProjectionBgImage(theme.url);
                                setProjectionBgMode('image');
                                if (window.api) {
                                  window.api.setSettings('projectionBgImage', theme.url);
                                  window.api.setSettings('projectionBgMode', 'image');
                                  window.api.broadcastStatus({
                                    projectionBgMode: 'image',
                                    projectionBgImage: theme.url
                                  });
                                }
                              }}
                              className={`relative aspect-video rounded overflow-hidden border-2 transition-all ${
                                isActive ? 'border-primary shadow-sm ring-1 ring-primary/20 scale-[1.03]' : 'border-border/60 hover:border-border'
                              }`}
                              title={theme.name}
                            >
                              <img src={theme.url} alt={theme.name} className="w-full h-full object-cover" />
                            </button>
                          );
                        })}
                        {/* Custom uploaded image slot if active */}
                        {projectionBgImage && projectionBgImage.startsWith('data:image/') && (
                          <button
                            type="button"
                            onClick={() => {
                              setProjectionBgImage(projectionBgImage);
                              setProjectionBgMode('image');
                              if (window.api) {
                                window.api.setSettings('projectionBgImage', projectionBgImage);
                                window.api.setSettings('projectionBgMode', 'image');
                                window.api.broadcastStatus({
                                  projectionBgMode: 'image',
                                  projectionBgImage
                                });
                              }
                            }}
                            className="relative aspect-video rounded overflow-hidden border-2 border-primary shadow-sm ring-1 ring-primary/20 scale-[1.03]"
                            title="Custom Uploaded Image"
                          >
                            <img src={projectionBgImage} alt="Custom upload" className="w-full h-full object-cover" />
                          </button>
                        )}
                      </div>
                      
                      <div className="pt-1">
                        <label className="flex items-center justify-center gap-1.5 w-full py-1.5 border border-dashed border-border rounded text-xs font-semibold cursor-pointer hover:bg-muted/30 transition-colors">
                          <Upload className="w-3.5 h-3.5" />
                          <span>Upload Custom Image</span>
                          <input 
                            type="file" 
                            accept="image/*" 
                            onChange={handleCustomImageUpload} 
                            className="hidden" 
                          />
                        </label>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2 pt-1">
                    <label className="text-xs font-semibold text-foreground">Projection Font</label>
                    <div className="grid grid-cols-1 gap-1.5">
                      {[
                        { id: 'cinzel',           label: 'Cinzel',           sub: 'Classical / Majestic',   style: { fontFamily: '"Cinzel", serif' } },
                        { id: 'eb-garamond',      label: 'EB Garamond',      sub: 'Traditional Scripture',  style: { fontFamily: '"EB Garamond", serif', fontStyle: 'italic' } },
                        { id: 'lora',             label: 'Lora',             sub: 'Literary Serif',         style: { fontFamily: '"Lora", serif', fontStyle: 'italic' } },
                        { id: 'playfair-display', label: 'Playfair Display', sub: 'Editorial / Elegant',    style: { fontFamily: '"Playfair Display", serif', fontStyle: 'italic' } },
                        { id: 'raleway',          label: 'Raleway',          sub: 'Modern / Clean',         style: { fontFamily: '"Raleway", sans-serif' } },
                        { id: 'inter',            label: 'Inter',            sub: 'Minimal / Contemporary', style: { fontFamily: '"Inter", sans-serif' } },
                      ].map(font => {
                        const isActive = projectionFontFamily === font.id;
                        return (
                          <button
                            type="button"
                            key={font.id}
                            onClick={() => {
                              setProjectionFontFamily(font.id);
                              if (window.api) {
                                window.api.setSettings('projectionFontFamily', font.id);
                                window.api.broadcastStatus({ projectionFontFamily: font.id });
                              }
                            }}
                            className={`flex items-center justify-between px-3 py-2 rounded border transition-all text-left ${
                              isActive
                                ? 'border-primary bg-primary/10 shadow-sm'
                                : 'border-border/60 hover:border-border bg-transparent'
                            }`}
                          >
                            <div>
                              <span className="text-sm font-medium" style={font.style}>{font.label}</span>
                              <span className="block text-[10px] text-muted-foreground">{font.sub}</span>
                            </div>
                            {isActive && <span className="text-primary text-xs font-bold">✓</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  
                  <label className="flex items-center gap-2 text-xs font-semibold pt-1 cursor-pointer pb-2">
                    <input
                      type="checkbox"
                      checked={showVerseNumbers}
                      onChange={e => {
                        const val = e.target.checked;
                        setShowVerseNumbers(val);
                        if (window.api) {
                          window.api.setSettings('showVerseNumbers', val);
                          window.api.broadcastStatus({ showVerseNumbers: val });
                        }
                      }}
                    /> Show verse numbers in text
                  </label>

                  {/* Slide Presets Editor */}
                  <div className="space-y-4 pt-2 border-t border-border/50">
                    <h3 className="text-xs font-bold uppercase text-muted-foreground border-b pb-1">Slide Type Style Presets</h3>
                    
                    {/* Category Selection Tabs */}
                    <div className="flex bg-muted/45 p-0.5 rounded border border-border text-[10px]">
                      {(['scripture', 'song', 'announcement', 'custom'] as const).map(cat => (
                        <button
                          type="button"
                          key={cat}
                          onClick={() => setEditingPresetCategory(cat)}
                          className={`flex-1 py-1 font-bold rounded capitalize transition-all ${
                            editingPresetCategory === cat ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>

                    {/* Preset Properties Editor */}
                    {(() => {
                      const preset = 
                        editingPresetCategory === 'scripture' ? presetScripture :
                        editingPresetCategory === 'song' ? presetSong :
                        editingPresetCategory === 'announcement' ? presetAnnouncement :
                        presetCustom;
                      const activeP = preset || defaultPreset;

                      return (
                        <div className="space-y-3 p-3 bg-muted/20 border border-border/80 rounded-md animate-in fade-in duration-200">
                          {/* Scale Slider */}
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs font-semibold text-foreground">
                              <span>Font Size Scale</span>
                              <span className="text-primary font-bold">{activeP.fontSizeScale?.toFixed(1)}x</span>
                            </div>
                            <input
                              type="range"
                              min="0.5"
                              max="2.0"
                              step="0.1"
                              value={activeP.fontSizeScale ?? 1.0}
                              onChange={e => updatePresetField('fontSizeScale', parseFloat(e.target.value))}
                              className="w-full accent-primary"
                            />
                          </div>

                          {/* Background Style Mode */}
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-muted-foreground uppercase">Background Mode</label>
                            <div className="flex bg-muted/50 p-0.5 rounded-md border border-border text-[10px]">
                              {['global', 'color', 'image', 'gradient'].map((mode) => (
                                <button
                                  type="button"
                                  key={mode}
                                  onClick={() => updatePresetField('projectionBgMode', mode)}
                                  className={`flex-1 py-0.5 font-semibold rounded capitalize transition-all ${
                                    (activeP.projectionBgMode || 'global') === mode ? 'bg-secondary text-foreground font-bold' : 'text-muted-foreground hover:text-foreground'
                                  }`}
                                >
                                  {mode === 'global' ? 'Global' : mode}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Solid Background Color */}
                          {activeP.projectionBgMode === 'color' && (
                            <div className="space-y-1">
                              <label className="text-xs font-semibold text-foreground">Solid Color</label>
                              <div className="flex gap-2">
                                <input 
                                  type="color" 
                                  value={activeP.projectionBgColor ?? '#000000'} 
                                  onChange={e => updatePresetField('projectionBgColor', e.target.value)} 
                                  className="w-8 h-8 rounded border p-0 cursor-pointer" 
                                />
                                <input 
                                  type="text" 
                                  value={activeP.projectionBgColor ?? '#000000'} 
                                  onChange={e => updatePresetField('projectionBgColor', e.target.value)} 
                                  className="w-full text-xs px-2 bg-card border rounded" 
                                />
                              </div>
                            </div>
                          )}

                          {/* HSL Gradient Selector */}
                          {activeP.projectionBgMode === 'gradient' && (
                            <div className="space-y-1.5">
                              <label className="text-xs font-semibold text-foreground">Gradient Theme</label>
                              <div className="grid grid-cols-2 gap-1.5">
                                {GRADIENT_THEMES.map(theme => {
                                  const isActive = (activeP.projectionBgGradient ?? 'twilight') === theme.id;
                                  return (
                                    <button
                                      type="button"
                                      key={theme.id}
                                      onClick={() => updatePresetField('projectionBgGradient', theme.id)}
                                      className={`relative p-2 rounded overflow-hidden border text-left transition-all h-10 flex flex-col justify-end ${
                                        isActive ? 'border-primary ring-1 ring-primary/20 scale-[1.02]' : 'border-border/60 hover:border-border'
                                      }`}
                                      style={{ background: theme.previewStyle }}
                                    >
                                      <span className="text-[10px] font-bold text-white drop-shadow-md select-none leading-none">
                                        {theme.name}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Image Theme Selector */}
                          {activeP.projectionBgMode === 'image' && (
                            <div className="space-y-1.5">
                              <label className="text-xs font-semibold text-foreground">Select Backdrop Image</label>
                              <div className="grid grid-cols-5 gap-1">
                                {BACKGROUND_THEMES.map(theme => {
                                  const isActive = activeP.projectionBgImage === theme.url;
                                  return (
                                    <button
                                      type="button"
                                      key={theme.id}
                                      onClick={() => updatePresetField('projectionBgImage', theme.url)}
                                      className={`relative aspect-video rounded overflow-hidden border transition-all ${
                                        isActive ? 'border-primary scale-[1.03]' : 'border-border/60 hover:border-border'
                                      }`}
                                      title={theme.name}
                                    >
                                      <img src={theme.url} alt={theme.name} className="w-full h-full object-cover" />
                                    </button>
                                  );
                                })}
                                {/* Custom upload image preview */}
                                {activeP.projectionBgImage && activeP.projectionBgImage.startsWith('data:image/') && (
                                  <button
                                    type="button"
                                    onClick={() => updatePresetField('projectionBgImage', activeP.projectionBgImage)}
                                    className="relative aspect-video rounded overflow-hidden border border-primary scale-[1.03]"
                                  >
                                    <img src={activeP.projectionBgImage} alt="Custom" className="w-full h-full object-cover" />
                                  </button>
                                )}
                              </div>
                              <div className="pt-0.5">
                                <label className="flex items-center justify-center gap-1 w-full py-1 border border-dashed border-border rounded text-[10px] font-semibold cursor-pointer hover:bg-muted/30 transition-colors">
                                  <Upload className="w-3.5 h-3.5" />
                                  <span>Upload Custom Image</span>
                                  <input 
                                    type="file" 
                                    accept="image/*" 
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file) {
                                        const reader = new FileReader();
                                        reader.onload = (event) => {
                                          if (event.target?.result) {
                                            updatePresetField('projectionBgImage', event.target.result as string);
                                          }
                                        };
                                        reader.readAsDataURL(file);
                                      }
                                    }} 
                                    className="hidden" 
                                  />
                                </label>
                              </div>
                            </div>
                          )}

                          {/* Font Selection */}
                          <div className="space-y-1">
                            <label className="text-xs font-semibold text-foreground">Preset Font</label>
                            <select
                              value={activeP.projectionFontFamily ?? 'serif'}
                              onChange={e => updatePresetField('projectionFontFamily', e.target.value)}
                              className="w-full text-xs p-1.5 bg-card border rounded outline-none"
                            >
                              <option value="cinzel">Cinzel (Classical)</option>
                              <option value="eb-garamond">EB Garamond (Traditional)</option>
                              <option value="lora">Lora (Literary)</option>
                              <option value="playfair-display">Playfair Display (Elegant)</option>
                              <option value="raleway">Raleway (Modern Sans)</option>
                              <option value="inter">Inter (Minimalist)</option>
                              <option value="serif">Georgia (Standard Serif)</option>
                              <option value="sans-serif">System Sans (Clean)</option>
                            </select>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
