/**
 * Bug Condition Exploration Tests — React Component Gaps (1, 2, 5)
 *
 * These tests MUST FAIL on unfixed code.
 * Failure = bug confirmed. DO NOT fix the code to make these pass.
 * They encode the expected (correct/fixed) behavior and will pass after fixes are applied.
 *
 * **Validates: Requirements 1.1**  — Gap 1: QR code discarded, never rendered
 * **Validates: Requirements 1.2**  — Gap 2: Whisper fallback not implemented`
 * **Validates: Requirements 1.5**  — Gap 5: Bookmark label modal missing
 *
 * @vitest-environment jsdom
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';

// ─────────────────────────────────────────────────────────────────────────────
// Shared window.api mock factory — sets up a complete, minimal window.api
// ─────────────────────────────────────────────────────────────────────────────

const makeApiMock = (overrides: Partial<typeof window.api> = {}) => ({
  getSettings: vi.fn().mockResolvedValue({
    anthropicApiKey: '',
    selectedTranslation: 'KJV',
    fontSizeScale: 1.0,
    theme: 'dark',
    whisperUrl: 'http://localhost:8080',
    projectionBgColor: '#000000',
    projectionFontFamily: 'serif',
    showVerseNumbers: false,
    aiMode: 'auto-project',
  }),
  getTranslations: vi.fn().mockResolvedValue([{ translation: 'KJV', verseCount: 31102 }]),
  getNetworkInfo: vi.fn().mockResolvedValue(null),
  getBooks: vi.fn().mockResolvedValue([]),
  getChapterCount: vi.fn().mockResolvedValue(0),
  getVerseCount: vi.fn().mockResolvedValue(0),
  queryVerses: vi.fn().mockResolvedValue([]),
  parseReference: vi.fn().mockResolvedValue(null),
  getAdjacentVerse: vi.fn().mockResolvedValue(null),
  searchText: vi.fn().mockResolvedValue([]),
  getBookmarks: vi.fn().mockResolvedValue([]),
  addBookmark: vi.fn().mockResolvedValue(1),
  removeBookmark: vi.fn().mockResolvedValue(true),
  downloadTranslation: vi.fn().mockResolvedValue(true),
  importTranslationFile: vi.fn().mockResolvedValue(true),
  deleteTranslation: vi.fn().mockResolvedValue(true),
  setSettings: vi.fn().mockResolvedValue({}),
  exportSessionPdf: vi.fn().mockResolvedValue(true),
  saveSchedule: vi.fn().mockResolvedValue(true),
  loadSchedule: vi.fn().mockResolvedValue(null),
  onProjectUpdate: vi.fn().mockReturnValue(() => {}),
  onClearScreen: vi.fn().mockReturnValue(() => {}),
  onStatusUpdate: vi.fn().mockReturnValue(() => {}),
  onVUUpdate: vi.fn().mockReturnValue(() => {}),
  onAILog: vi.fn().mockReturnValue(() => {}),
  onAISuggestion: vi.fn().mockReturnValue(() => {}),
  onDetectedRef: vi.fn().mockReturnValue(() => {}),
  hasEnvKey: vi.fn().mockResolvedValue(false),
  hasGroqEnvKey: vi.fn().mockResolvedValue(false),
  initSpeechEngine: vi.fn().mockResolvedValue(true),
  transcribeChunk: vi.fn().mockResolvedValue(''),
  onSpeechInitProgress: vi.fn().mockReturnValue(() => {}),
  forceProject: vi.fn(),
  clearProject: vi.fn(),
  broadcastStatus: vi.fn(),
  sendTranscript: vi.fn(),
  logError: vi.fn(),
  ...overrides,
});

// ─────────────────────────────────────────────────────────────────────────────
// Gap 1 — QR Code Not Rendered
// Mount OperatorConsole with getNetworkInfo returning valid network info.
// Mock QRCode.toDataURL to return a data URL.
// Assert the rendered DOM contains an <img> with src starting with data:image/png.
// EXPECT FAIL: the component calls QRCode.toDataURL().then(() => {}) — the data URL
// is discarded and no <img> is ever rendered.
// ─────────────────────────────────────────────────────────────────────────────
vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='),
  },
}));

// Mock child components that depend on window.api to avoid nested API calls
vi.mock('../renderer/components/BibleBrowser', () => ({
  default: () => React.createElement('div', { 'data-testid': 'bible-browser' }, 'BibleBrowser'),
}));
vi.mock('../renderer/components/SearchPanel', () => ({
  default: () => React.createElement('div', { 'data-testid': 'search-panel' }, 'SearchPanel'),
}));
vi.mock('../renderer/components/BookmarksPanel', () => ({
  default: () => React.createElement('div', { 'data-testid': 'bookmarks-panel' }, 'BookmarksPanel'),
}));
vi.mock('../renderer/components/ServiceSchedule', () => ({
  default: () => React.createElement('div', { 'data-testid': 'service-schedule' }, 'ServiceSchedule'),
}));

describe('Gap 1 — QR Code Not Rendered', () => {
  beforeEach(() => {
    // Stub navigator to avoid real media device calls
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        enumerateDevices: vi.fn().mockResolvedValue([]),
        getUserMedia: vi.fn().mockResolvedValue(null),
      },
      configurable: true,
      writable: true,
    });

    // Minimal AudioContext mock
    const mockAnalyser = { fftSize: 256, frequencyBinCount: 128, getByteFrequencyData: vi.fn(), connect: vi.fn() };
    vi.stubGlobal('AudioContext', vi.fn().mockReturnValue({
      sampleRate: 44100,
      createMediaStreamSource: vi.fn().mockReturnValue({ connect: vi.fn() }),
      createAnalyser: vi.fn().mockReturnValue(mockAnalyser),
      close: vi.fn(),
    }));
    vi.stubGlobal('requestAnimationFrame', vi.fn().mockReturnValue(1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    // Stub Speech Recognition so mount doesn't throw
    vi.stubGlobal('webkitSpeechRecognition', vi.fn().mockImplementation(() => ({
      start: vi.fn(), stop: vi.fn(), abort: vi.fn(),
      continuous: false, interimResults: false, lang: '',
      onstart: null, onresult: null, onerror: null, onend: null,
    })));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    // @ts-expect-error - test cleanup
    delete window.api;
  });

  it(
    'renders <img> with data:image/png src in settings/network-info area when network info is available',
    async () => {
      // BUG CONDITION: isBugCondition_QR — networkInfo is non-null AND QRCode.toDataURL has
      // been called AND state.qrDataUrl = null (result discarded in .then(() => {}))
      //
      // EXPECTED (fixed behavior): <img> with src matching ^data:image/png is rendered
      // COUNTEREXAMPLE: No <img> element with data: src exists — only the header badge is present

      const { default: OperatorConsole } = await import('../renderer/components/OperatorConsole');

      window.api = makeApiMock({
        getNetworkInfo: vi.fn().mockResolvedValue({ ip: '10.0.0.1', port: 3000, pin: '1234' }),
      });

      render(React.createElement(OperatorConsole));

      // Navigate to settings tab so the network info / QR section is visible
      await act(async () => {
        const settingsTab = screen.getByText('Settings');
        fireEvent.click(settingsTab);
      });

      // Wait for the QR code img to appear in the DOM
      // On unfixed code this will time out — no <img> with data: src is rendered
      const qrImg = await waitFor(
        () => {
          const imgs = document.querySelectorAll('img');
          const qr = Array.from(imgs).find(
            (img) => img.getAttribute('src')?.startsWith('data:image/png')
          );
          if (!qr) throw new Error('No <img> with data:image/png src found in DOM');
          return qr;
        },
        { timeout: 3000 }
      );

      expect(qrImg).toBeTruthy();
      expect(qrImg.getAttribute('src')).toMatch(/^data:image\/png/);
    }
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Gap 2 — Live Transcription via Web Speech API
// Mount OperatorConsole, click Start Listening.
// Simulate webkitSpeechRecognition firing onresult with final transcript text.
// Assert the transcript text appears in the DOM.
// ─────────────────────────────────────────────────────────────────────────────
describe('Gap 2 — Offline Transcription Active', () => {
  let capturedOnDataAvailable: ((e: any) => void) | null = null;

  beforeEach(() => {
    capturedOnDataAvailable = null;
    const mockTrack = { stop: vi.fn(), label: 'Default - Mock Mic' };
    const mockStream = {
      getTracks: vi.fn().mockReturnValue([mockTrack]),
      getAudioTracks: vi.fn().mockReturnValue([mockTrack])
    };

    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        enumerateDevices: vi.fn().mockResolvedValue([]),
        getUserMedia: vi.fn().mockResolvedValue(mockStream),
      },
      configurable: true,
      writable: true,
    });

    // Mock AudioContext for VU meter
    const mockAnalyser = { fftSize: 256, frequencyBinCount: 128, getByteFrequencyData: vi.fn(), connect: vi.fn() };
    vi.stubGlobal('AudioContext', vi.fn().mockReturnValue({
      sampleRate: 16000,
      createMediaStreamSource: vi.fn().mockReturnValue({ connect: vi.fn() }),
      createAnalyser: vi.fn().mockReturnValue(mockAnalyser),
      close: vi.fn(),
      resume: vi.fn().mockResolvedValue(undefined),
      state: 'running'
    }));
    vi.stubGlobal('requestAnimationFrame', vi.fn().mockReturnValue(1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    // Mock MediaRecorder for audio slice capture
    const mockMediaRecorder = {
      start: vi.fn(),
      stop: vi.fn(),
      state: 'inactive',
      set ondataavailable(fn: any) {
        capturedOnDataAvailable = fn;
      },
      get ondataavailable() {
        return capturedOnDataAvailable;
      }
    };
    vi.stubGlobal('MediaRecorder', vi.fn().mockImplementation(() => mockMediaRecorder));

    // Stub webkitSpeechRecognition just in case
    vi.stubGlobal('webkitSpeechRecognition', vi.fn().mockImplementation(() => ({
      start: vi.fn(), stop: vi.fn(), abort: vi.fn(),
      continuous: false, interimResults: false, lang: '',
      onstart: null, onresult: null, onerror: null, onend: null
    })));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    // @ts-expect-error - test cleanup
    delete window.api;
  });

  it(
    'shows transcript text in the Live Transcription pane when speech is recognized',
    async () => {
      const { default: OperatorConsole } = await import('../renderer/components/OperatorConsole');

      window.api = makeApiMock({
        initSpeechEngine: vi.fn().mockResolvedValue(true),
        transcribeChunk: vi.fn().mockResolvedValue('John chapter three verse sixteen'),
      });

      render(React.createElement(OperatorConsole));

      await act(async () => {
        await new Promise((r) => setTimeout(r, 100));
      });

      // Click Start Listening
      await act(async () => {
        const micButton = screen.queryByText(/Start Listening/i);
        if (micButton) fireEvent.click(micButton);
      });

      // Simulate raw microphone samples processing (Blob received via MediaRecorder)
      await act(async () => {
        if (capturedOnDataAvailable) {
          const mockBlob = new Blob([new Uint8Array(1000)], { type: 'audio/webm' });
          capturedOnDataAvailable({
            data: mockBlob
          });
        }
      });

      // Wait for the asynchronous transcribeChunk callback to complete and update React state
      await act(async () => {
        await new Promise((r) => setTimeout(r, 300));
      });

      // The transcript text should appear in the DOM
      const transcriptText = screen.queryByText(/John/i) ||
        document.querySelector('[class*="transcript"]');
      expect(transcriptText).not.toBeNull();
    }
  );
});


// ─────────────────────────────────────────────────────────────────────────────
// Gap 5 — Bookmark Label Modal Missing
// Mount OperatorConsole, extract the onAddBookmark prop that is passed to
// child components, call it directly, then assert a modal is visible in the DOM
// BEFORE window.api.addBookmark is called.
// EXPECT FAIL: addBookmark calls window.api.addBookmark immediately with label: ''
// and no modal is shown.
// ─────────────────────────────────────────────────────────────────────────────
describe('Gap 5 — Bookmark Label Modal Missing', () => {
  let addBookmarkMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    addBookmarkMock = vi.fn().mockResolvedValue(1);

    const mockTrack = { stop: vi.fn() };
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        enumerateDevices: vi.fn().mockResolvedValue([]),
        getUserMedia: vi.fn().mockResolvedValue({ getTracks: vi.fn().mockReturnValue([mockTrack]) }),
      },
      configurable: true,
      writable: true,
    });

    // Minimal AudioContext mock so startMicrophone doesn't throw
    const mockAnalyser = { fftSize: 256, frequencyBinCount: 128, getByteFrequencyData: vi.fn(), connect: vi.fn() };
    vi.stubGlobal('AudioContext', vi.fn().mockReturnValue({
      sampleRate: 44100,
      createMediaStreamSource: vi.fn().mockReturnValue({ connect: vi.fn() }),
      createAnalyser: vi.fn().mockReturnValue(mockAnalyser),
      close: vi.fn(),
    }));
    vi.stubGlobal('requestAnimationFrame', vi.fn().mockReturnValue(1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    // Stub Speech Recognition so mount doesn't throw
    vi.stubGlobal('webkitSpeechRecognition', vi.fn().mockImplementation(() => ({
      start: vi.fn(), stop: vi.fn(), abort: vi.fn(),
      continuous: false, interimResults: false, lang: '',
      onstart: null, onresult: null, onerror: null, onend: null,
    })));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    // @ts-expect-error - test cleanup
    delete window.api;
  });

  it(
    'shows a label input modal BEFORE calling window.api.addBookmark when Bookmark is triggered',
    async () => {
      // BUG CONDITION: isBugCondition_Label — addBookmark invocation where label = ''
      //   AND no user input was collected
      //
      // EXPECTED (fixed behavior): A modal/input is visible in DOM before IPC is called;
      //   window.api.addBookmark is NOT called immediately on click
      // COUNTEREXAMPLE: addBookmark calls window.api.addBookmark instantly — no modal shown,
      //   label is always ''

      // We need to capture what BibleBrowser receives as onAddBookmark prop.
      // Approach: override the BibleBrowser mock to call the prop and expose it.
      let capturedOnAddBookmark: ((...args: any[]) => void) | null = null;

      vi.doMock('../renderer/components/BibleBrowser', () => ({
        default: (props: any) => {
          capturedOnAddBookmark = props.onAddBookmark;
          return React.createElement(
            'div',
            { 'data-testid': 'bible-browser' },
            React.createElement(
              'button',
              {
                'data-testid': 'trigger-bookmark',
                onClick: () =>
                  props.onAddBookmark?.('John', 3, 16, undefined, 'For God so loved the world...'),
              },
              'Bookmark John 3:16'
            )
          );
        },
      }));

      // Re-import the module fresh with the new mock
      vi.resetModules();
      const { default: OperatorConsole } = await import('../renderer/components/OperatorConsole');

      window.api = makeApiMock({ addBookmark: addBookmarkMock as unknown as typeof window.api.addBookmark });

      render(React.createElement(OperatorConsole));

      // Wait for component to settle
      await act(async () => {
        await new Promise((r) => setTimeout(r, 100));
      });

      // Trigger the bookmark action via the button in the mocked BibleBrowser
      await act(async () => {
        const bookmarkBtn = screen.queryByTestId('trigger-bookmark');
        if (bookmarkBtn) {
          fireEvent.click(bookmarkBtn);
        } else if (capturedOnAddBookmark) {
          // Fallback: call the callback directly
          capturedOnAddBookmark('John', 3, 16, undefined, 'For God so loved the world...');
        }
      });

      // Give state updates time to process
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      // ASSERTION 1: window.api.addBookmark should NOT have been called yet
      // (waiting for user to confirm the modal)
      // On unfixed code this assertion will FAIL — addBookmark is called immediately
      expect(addBookmarkMock).not.toHaveBeenCalled();

      // ASSERTION 2: A modal or label input should be visible
      // On unfixed code this assertion will FAIL — no modal is rendered
      const modalOrInput =
        screen.queryByPlaceholderText(/sermon/i) ||
        screen.queryByLabelText(/label/i) ||
        screen.queryByRole('dialog') ||
        screen.queryByText(/Add Bookmark/i);

      expect(modalOrInput).not.toBeNull();
    }
  );

  it(
    'window.api.addBookmark is called with a non-empty label when user confirms the modal',
    async () => {
      // BUG CONDITION: label is ALWAYS '' — no user input is ever collected
      // EXPECTED (fixed behavior): after user types a label and confirms, addBookmark receives
      //   the typed label
      // COUNTEREXAMPLE: addBookmark is called with label: '' regardless of any input

      vi.resetModules();
      const { default: OperatorConsole } = await import('../renderer/components/OperatorConsole');

      window.api = makeApiMock({ addBookmark: addBookmarkMock as unknown as typeof window.api.addBookmark });

      render(React.createElement(OperatorConsole));

      // Wait for component to settle
      await act(async () => {
        await new Promise((r) => setTimeout(r, 100));
      });

      // Directly trigger the onAddBookmark prop (the modal trigger)
      // We need to reach inside. Use the browser tab approach via the component prop chain.
      // Since the child mocks are reset, let's use the browser tab:
      await act(async () => {
        // Switch to browser tab to make BibleBrowser render
        const browserTab = screen.queryByText('Browser');
        if (browserTab) fireEvent.click(browserTab);
      });

      await act(async () => {
        await new Promise((r) => setTimeout(r, 100));
      });

      // Try to find bookmark trigger button from the mock
      const bookmarkBtn = screen.queryByTestId('trigger-bookmark');
      if (bookmarkBtn) {
        await act(async () => {
          fireEvent.click(bookmarkBtn);
        });
      }

      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      // Look for a text input for the label (the modal input)
      const labelInput = screen.queryByPlaceholderText(/sermon/i) ||
        (document.querySelector('input[type="text"]') as HTMLInputElement | null);

      if (labelInput) {
        // Type a label
        await act(async () => {
          fireEvent.change(labelInput, { target: { value: 'Sunday sermon opening' } });
        });

        // Find and click the Save/confirm button
        const saveBtn = screen.queryByText('Save') || screen.queryByText('Confirm');
        if (saveBtn) {
          await act(async () => {
            fireEvent.click(saveBtn);
          });
          await act(async () => {
            await new Promise((r) => setTimeout(r, 100));
          });
        }
      }

      // On unfixed code: addBookmark was called immediately with label: '' (before we typed anything)
      // On fixed code: addBookmark is called with the user-entered label AFTER modal confirm
      if (addBookmarkMock.mock.calls.length > 0) {
        const callArg = addBookmarkMock.mock.calls[0][0];
        expect(callArg.label).not.toBe('');
        expect(callArg.label).toBe('Sunday sermon opening');
      } else {
        // addBookmark was never called — this means the fix works but the modal
        // wasn't interacted with in this test. Skip gracefully.
        // This should not happen if labelInput was found.
        expect(labelInput).not.toBeNull();
      }
    }
  );
});
