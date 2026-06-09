# Implementation Plan

## Overview

This task list implements the five completion gaps identified in the bugfix spec using the exploratory bugfix workflow: explore (write tests against unfixed code), preserve (capture baseline behavior), implement (apply each fix), and validate (verify fix + no regressions).

## Tasks

- [-] 1. Write bug condition exploration tests (BEFORE implementing any fix)
  - **Property 1: Bug Condition** - Five Implementation Gaps (QR Discard, Whisper Stub, No Packaging, Loose Types, Empty Bookmark Label)
  - **CRITICAL**: These tests MUST FAIL on unfixed code — failure confirms each bug exists
  - **DO NOT attempt to fix the tests or the code when they fail**
  - **NOTE**: These tests encode expected behavior — they will validate the fix when they pass after implementation
  - **GOAL**: Surface counterexamples that demonstrate each gap on unfixed code
  - **Scoped PBT Approach**: For deterministic gaps (3, 4, 5), scope to concrete failing cases; for runtime-conditional gaps (1, 2), use mocked environments
  - Gap 1 — QR: Mount `OperatorConsole` with mocked `getNetworkInfo` returning `{ ip: '10.0.0.1', port: 3000, pin: '1234' }` and mocked `QRCode.toDataURL`. Assert that the rendered DOM contains an `<img>` element whose `src` matches `^data:image/png`. Run on unfixed code — EXPECT FAIL (no `<img>` is rendered because `.then(() => {})` discards the data URL).
  - Gap 2 — Whisper: Call `startSpeechRecognition()` in an environment where `window.SpeechRecognition = undefined` and `window.webkitSpeechRecognition = undefined`. Mock `fetch`. Assert that `fetch` is called with a URL containing `http://localhost:8080/inference` (isBugCondition_Whisper: both SpeechRecognition globals are undefined AND isRecording = true). Run on unfixed code — EXPECT FAIL (function logs warning and returns; `fetch` is never called).
  - Gap 3 — Packaging: Programmatically read `package.json` and assert `"electron-builder"` exists in `devDependencies`. Assert `"package"` script exists in `scripts`. Assert `electron-builder.json` exists in the project root. Run against current project state — EXPECT FAIL on all three assertions.
  - Gap 4 — Types: Write a TypeScript test file that assigns `window.api.queryVerses({...})` result directly to a `VerseResult[]` variable without any cast. Run `tsc --noEmit` and assert zero type errors on this assignment. Run on unfixed `vite-env.d.ts` — EXPECT FAIL (return type is `Promise<any[]>`, assignment to typed array would error under strict checks). Also assert `window.api.addBookmark` parameter is not `any`.
  - Gap 5 — Bookmark Label: Simulate clicking "Add Bookmark" on a verse (triggering `addBookmark` callback). Assert a modal or label input is present in the DOM BEFORE `window.api.addBookmark` is called. Run on unfixed code — EXPECT FAIL (IPC is called immediately; no modal is rendered).
  - Document counterexamples found (e.g., "No `<img>` with data: src rendered", "`fetch` to whisperUrl never called", "`electron-builder` absent from package.json", "`addBookmark` receives `any` parameter", "`window.api.addBookmark` called with `label: ''` without any user input prompt")
  - Mark task complete when all five exploration tests are written, run, and failures are documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [~] 2. Write preservation property tests (BEFORE implementing any fix)
  - **Property 2: Preservation** - Unchanged Behavior Across All Five Gaps
  - **IMPORTANT**: Follow observation-first methodology — observe behavior on UNFIXED code for non-buggy inputs first
  - **Observe on unfixed code (non-buggy paths):**
    - Gap 1 Preservation: When `networkInfo = null`, confirm `QRCode.toDataURL` is NOT called and the header badge is absent (no crash, no extra render). Observe the header renders correctly with IP/port/PIN when networkInfo is non-null — the badge block must remain unchanged.
    - Gap 2 Preservation: When `window.SpeechRecognition` IS defined, confirm `startSpeechRecognition()` creates a `SpeechRecognition` instance with `continuous: true`, `interimResults: true`, `lang: 'en-US'`, and attaches `onresult`, `onerror`, `onend` handlers — identical to the original implementation.
    - Gap 3 Preservation: Confirm `npm run dev` starts without requiring `electron-builder`. Observe that the `build` script does not invoke `electron-builder`. These paths must not be altered by the packaging changes.
    - Gap 4 Preservation: Confirm that after updating `vite-env.d.ts`, `tsc --noEmit` produces zero errors across all eight renderer components: `App.tsx`, `OperatorConsole.tsx`, `ProjectionScreen.tsx`, `MobileRemote.tsx`, `BibleBrowser.tsx`, `SearchPanel.tsx`, `ServiceSchedule.tsx`, `BookmarksPanel.tsx`.
    - Gap 5 Preservation: After the modal is confirmed with any label (including empty), confirm that `window.api.addBookmark` is still called, `setBookmarksRefresh` increments, the right panel tab switches to `'bookmarks'`, and a success AI-log entry is emitted.
  - Write property-based tests capturing these observed behavior patterns:
    - For all `networkInfo` values that are null: assert no `QRCode.toDataURL` call is made
    - For all runtime environments where `SpeechRecognition` is defined: assert the Web Speech API path runs identically (same constructor, same config, same handlers)
    - For all `addBookmark()` completions (any label including ''): assert IPC + refresh + tab switch + AI-log sequence fires
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: All preservation tests PASS on unfixed code (this confirms baseline behavior to preserve)
  - Mark task complete when preservation tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [ ] 3. Fix Gap 1 — QR Code not rendered in OperatorConsole.tsx

  - [~] 3.1 Add `qrDataUrl` state and capture the resolved data URL
    - In `OperatorConsole.tsx`, add state variable: `const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);`
    - In the `getNetworkInfo` `.then()` block, replace `.then(() => {})` with `.then((dataUrl: string) => setQrDataUrl(dataUrl))`
    - _Bug_Condition: isBugCondition_QR — networkInfo is non-null AND QRCode.toDataURL has been called AND state.qrDataUrl = null (result was discarded)_
    - _Expected_Behavior: state.qrDataUrl is non-null; rendered DOM contains `<img src={qrDataUrl}>`_
    - _Preservation: Header badge rendering of IP/port/PIN must remain byte-for-byte unchanged (Requirement 3.4)_
    - _Requirements: 2.1, 3.4_

  - [~] 3.2 Render the QR code `<img>` in the settings/network-info section
    - In the settings tab (right pane), within the network info area, add a conditional block:
      ```tsx
      {qrDataUrl && (
        <div className="mt-3">
          <p className="text-xs text-muted-foreground font-semibold mb-1">Scan to connect mobile remote:</p>
          <img src={qrDataUrl} alt="QR Code for mobile remote" className="w-32 h-32 rounded border border-border" />
        </div>
      )}
      ```
    - Do NOT modify the existing header badge block that renders `networkInfo.ip`, `networkInfo.port`, `networkInfo.pin`
    - _Requirements: 2.1, 3.4_

  - [~] 3.3 Verify bug condition exploration test now passes for Gap 1
    - **Property 1: Expected Behavior** - QR Code Stored and Rendered
    - **IMPORTANT**: Re-run the SAME Gap 1 test from task 1 — do NOT write a new test
    - The test asserts `state.qrDataUrl != null` and `<img src={qrDataUrl}>` is present in the DOM
    - **EXPECTED OUTCOME**: Test PASSES (confirms Gap 1 is fixed)
    - _Requirements: 2.1_

  - [~] 3.4 Verify Gap 1 preservation tests still pass
    - **Property 2: Preservation** - Header Badge Unmodified
    - Re-run the Gap 1 preservation tests from task 2 (null networkInfo path, header badge unchanged)
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - _Requirements: 3.4_

- [ ] 4. Fix Gap 2 — Whisper URL fallback not implemented in OperatorConsole.tsx

  - [~] 4.1 Add Whisper session state and MediaRecorder ref
    - Add state: `const [whisperSessionActive, setWhisperSessionActive] = useState(false);`
    - Add ref: `const mediaRecorderRef = useRef<MediaRecorder | null>(null);`
    - _Requirements: 2.2_

  - [~] 4.2 Replace the stub with a Whisper HTTP streaming fallback
    - In `startSpeechRecognition()`, replace the stub block (`addAiLog('warning', ...) / return`) with a MediaRecorder-based implementation that:
      1. Reads `whisperUrl` from component state (already populated from `getSettings`)
      2. Creates a `MediaRecorder` from `audioStreamRef.current` (already captured by `startMicrophone`)
      3. On each `ondataavailable` chunk, POSTs audio as multipart form data to `${whisperUrl}/inference`
      4. On successful fetch response, parses `{ text: string }` JSON and pipes it into `setTranscript` / `triggerAIDetectionDebounce`
      5. On fetch failure (network error or non-2xx), calls `addAiLog('error', \`Whisper server unreachable at ${whisperUrl}. Start the local Whisper server or check the URL in Settings.\`)` and calls `setIsRecording(false)`
    - The `if (SpeechRecognition)` branch above MUST remain unchanged — do not touch it
    - _Bug_Condition: isBugCondition_Whisper — window.SpeechRecognition = undefined AND window.webkitSpeechRecognition = undefined AND isRecording = true_
    - _Expected_Behavior: fetch is called with whisperUrl + '/inference'; on success transcript updates; on failure an actionable error log appears and recording stops_
    - _Preservation: When SpeechRecognition IS defined, the Web Speech API path runs identically (Requirement 3.1)_
    - _Requirements: 2.2, 3.1_

  - [~] 4.3 Extend `stopSpeechRecognition()` to also stop the MediaRecorder
    - In `stopSpeechRecognition()`, add cleanup: stop and null `mediaRecorderRef.current` if it is set
    - Set `whisperSessionActive` to false
    - _Requirements: 2.2_

  - [~] 4.4 Verify bug condition exploration test now passes for Gap 2
    - **Property 1: Expected Behavior** - Whisper Fallback Activated
    - Re-run the SAME Gap 2 tests from task 1 (mock Web Speech API absent, mock fetch)
    - Assert `fetch` is called to `${whisperUrl}/inference`; assert error AI-log emitted when fetch fails
    - **EXPECTED OUTCOME**: Tests PASS (confirms Gap 2 is fixed)
    - _Requirements: 2.2_

  - [~] 4.5 Verify Gap 2 preservation tests still pass
    - **Property 2: Preservation** - Web Speech API Path Unchanged
    - Re-run the Gap 2 preservation tests from task 2 (SpeechRecognition defined path)
    - Assert `continuous: true`, `interimResults: true`, `lang: 'en-US'`, same event handlers — unchanged
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions to existing speech path)
    - _Requirements: 3.1_

- [ ] 5. Fix Gap 3 — No electron-builder packaging config

  - [~] 5.1 Add `electron-builder` devDependency to `package.json`
    - Add `"electron-builder": "^24.9.1"` to `devDependencies` in `package.json`
    - Run `npm install` to install the dependency
    - _Bug_Condition: isBugCondition_Packaging — "electron-builder" NOT IN package.json.devDependencies_
    - _Requirements: 2.3_

  - [~] 5.2 Add `package` and `dist:win` scripts to `package.json`
    - Add to `scripts` in `package.json`:
      ```json
      "package": "npm run build && electron-builder",
      "dist:win": "npm run build && electron-builder --win"
      ```
    - Do NOT modify the existing `dev`, `build`, `preview`, or `test` scripts
    - _Bug_Condition: isBugCondition_Packaging — "package" NOT IN package.json.scripts_
    - _Preservation: npm run dev and npm run build must remain unchanged (Requirement 3.3)_
    - _Requirements: 2.3, 3.3_

  - [~] 5.3 Create `electron-builder.json` in the project root
    - Create `electron-builder.json` with the following content:
      ```json
      {
        "appId": "com.scripture-presenter.app",
        "productName": "Scripture Presenter",
        "directories": {
          "output": "release"
        },
        "files": [
          "dist/**/*",
          "dist-electron/**/*",
          "bible.db"
        ],
        "extraResources": [
          { "from": "bible.db", "to": "bible.db" }
        ],
        "asar": true,
        "win": {
          "target": "nsis"
        },
        "nsis": {
          "oneClick": false,
          "allowToChangeInstallationDirectory": true
        }
      }
      ```
    - Omit the `icon` field if no `.ico` asset exists at `src/renderer/assets/icon.ico` — the build must not fail on a missing asset
    - _Bug_Condition: isBugCondition_Packaging — electron-builder.json DOES NOT EXIST_
    - _Expected_Behavior: electron-builder.json EXISTS AND is valid JSON with required fields (appId, productName, output directory, asar: true, win NSIS target)_
    - _Requirements: 2.3_

  - [~] 5.4 Verify bug condition exploration test now passes for Gap 3
    - **Property 1: Expected Behavior** - Packaging Command Produces Installer
    - Re-run the SAME Gap 3 tests from task 1: assert `"electron-builder"` in devDependencies, `"package"` in scripts, `electron-builder.json` exists
    - **EXPECTED OUTCOME**: All three assertions PASS
    - _Requirements: 2.3_

  - [~] 5.5 Verify Gap 3 preservation tests still pass
    - **Property 2: Preservation** - Dev Mode Unaffected
    - Re-run the Gap 3 preservation tests from task 2 (`dev` and `build` scripts unchanged, no electron-builder invocation in dev path)
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions to dev workflow)
    - _Requirements: 3.3_

- [ ] 6. Fix Gap 4 — Incomplete `window.api` TypeScript declarations in `vite-env.d.ts`

  - [~] 6.1 Add concrete shared interfaces above the `Window` declaration
    - In `src/renderer/vite-env.d.ts`, add the following interfaces before the `interface Window` block:
      ```typescript
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
        selectedTranslation: string;
        fontSizeScale: number;
        theme: string;
        whisperUrl: string;
        projectionBgColor: string;
        projectionFontFamily: string;
        showVerseNumbers: boolean;
        aiMode: string;
      }
      ```
    - _Bug_Condition: isBugCondition_Types — method parameter or return typed as `any` WHERE concrete type IS determinable_
    - _Requirements: 2.4_

  - [~] 6.2 Replace `any`-typed method signatures with concrete types
    - Update `Window.api` method signatures in `vite-env.d.ts` to use the new interfaces:
      - `queryVerses: (query: VerseQuery) => Promise<VerseResult[]>`
      - `parseReference: (refStr: string) => Promise<ParsedReference | null>`
      - `searchText: (translation: string, query: string, limit?: number) => Promise<VerseResult[]>`
      - `getBookmarks: () => Promise<BookmarkRecord[]>`
      - `addBookmark: (bookmark: Omit<BookmarkRecord, 'id'>) => Promise<number>`
      - `getTranslations: () => Promise<TranslationRecord[]>`
      - `getSettings: () => Promise<AppSettings>`
      - `setSettings: (key: keyof AppSettings, value: AppSettings[keyof AppSettings]) => Promise<AppSettings>`
      - `getNetworkInfo: () => Promise<NetworkInfo | null>`
      - `onProjectUpdate: (callback: (event: Electron.IpcRendererEvent, data: ProjectionData) => void) => () => void`
      - `onClearScreen: (callback: () => void) => () => void`
      - `onStatusUpdate: (callback: (event: Electron.IpcRendererEvent, status: Partial<AppSettings> & { blackout?: boolean }) => void) => () => void`
      - `onVUUpdate: (callback: (event: Electron.IpcRendererEvent, value: number) => void) => () => void`
      - `onAILog: (callback: (event: Electron.IpcRendererEvent, data: { type: 'info' | 'success' | 'warning' | 'error'; message: string }) => void) => () => void`
      - `onAISuggestion: (callback: (event: Electron.IpcRendererEvent, data: ProjectionData) => void) => () => void`
      - `forceProject: (verseData: ProjectionData) => void`
      - `broadcastStatus: (status: Partial<AppSettings> & { blackout?: boolean }) => void`
      - `exportSessionPdf: (verses: ProjectionData[]) => Promise<boolean>`
    - Leave unchanged: `getBooks`, `getChapterCount`, `getVerseCount`, `removeBookmark`, `downloadTranslation`, `importTranslationFile`, `deleteTranslation`, `saveSchedule`, `loadSchedule`, `clearProject`, `sendTranscript`
    - _Expected_Behavior: tsc --noEmit exits with zero errors; no method uses `any` where concrete type is determinable_
    - _Preservation: All eight renderer components must compile without errors after this change (Requirement 3.5)_
    - _Requirements: 2.4, 3.5_

  - [~] 6.3 Run `tsc --noEmit` and resolve any resulting type errors in renderer components
    - Run `npx tsc --noEmit` from the project root
    - If any renderer component produces errors due to the tightened types, update the component call sites to match the new concrete types (remove unnecessary `as any` casts, add proper type annotations)
    - Do NOT change runtime behavior — types are erased at runtime; this is a compile-time-only fix
    - _Requirements: 2.4, 3.5_

  - [~] 6.4 Verify bug condition exploration test now passes for Gap 4
    - **Property 1: Expected Behavior** - Complete window.api Type Coverage
    - Re-run the SAME Gap 4 tests from task 1 (typed assignment of `queryVerses` result to `VerseResult[]` without cast, `addBookmark` parameter not `any`)
    - **EXPECTED OUTCOME**: Tests PASS and `tsc --noEmit` exits with zero errors
    - _Requirements: 2.4_

  - [~] 6.5 Verify Gap 4 preservation tests still pass
    - **Property 2: Preservation** - Zero TypeScript Compile Errors Across All Components
    - Re-run the Gap 4 preservation tests from task 2 (all eight renderer components compile clean)
    - **EXPECTED OUTCOME**: `tsc --noEmit` reports zero errors across all renderer files
    - _Requirements: 3.5_

- [ ] 7. Fix Gap 5 — Bookmark labels always empty in OperatorConsole.tsx

  - [~] 7.1 Add pending bookmark state for the two-step label collection flow
    - In `OperatorConsole.tsx`, add state:
      ```typescript
      const [pendingBookmark, setPendingBookmark] = useState<{
        book: string; chapter: number; verseStart: number; verseEnd?: number; text: string;
      } | null>(null);
      const [bookmarkLabel, setBookmarkLabel] = useState('');
      ```
    - _Bug_Condition: isBugCondition_Label — addBookmark invocation where label = '' AND no user input was collected_
    - _Requirements: 2.5_

  - [~] 7.2 Convert `addBookmark` to a two-step flow and add `confirmBookmark`
    - Rename the existing `addBookmark` helper to `confirmBookmark` — it will contain the actual IPC call
    - Replace `addBookmark` with a new function that:
      1. Sets `pendingBookmark` to the incoming `{ book, chapter, verseStart, verseEnd, text }` values
      2. Pre-populates `bookmarkLabel` with the verse reference string (e.g., `"John 3:16"`)
      3. Does NOT call `window.api.addBookmark` directly
    - `confirmBookmark` implementation:
      ```typescript
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
      ```
    - _Expected_Behavior: user IS presented with label input before save; stored bookmark.label = user_entered_value_
    - _Preservation: window.api.addBookmark, setBookmarksRefresh, setRightTab('bookmarks'), AI-log success — all must still fire on confirm (Requirement 3.2)_
    - _Requirements: 2.5, 3.2_

  - [~] 7.3 Add the bookmark label modal overlay to the OperatorConsole render output
    - At the root of the `OperatorConsole` return statement (above all other content), add the modal:
      ```tsx
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
      ```
    - Do NOT modify `BibleBrowser.tsx` or `SearchPanel.tsx` — they call `onAddBookmark` as before; label collection is entirely encapsulated in `OperatorConsole`
    - _Requirements: 2.5_

  - [~] 7.4 Verify bug condition exploration test now passes for Gap 5
    - **Property 1: Expected Behavior** - Bookmark Label Collected from User
    - Re-run the SAME Gap 5 tests from task 1 (modal visible before IPC call, `window.api.addBookmark` not called until confirm, label matches user-entered value)
    - **EXPECTED OUTCOME**: Tests PASS (confirms Gap 5 is fixed)
    - _Requirements: 2.5_

  - [~] 7.5 Verify Gap 5 preservation tests still pass
    - **Property 2: Preservation** - Bookmark IPC Flow Unchanged
    - Re-run the Gap 5 preservation tests from task 2 (after modal confirm: IPC call fires, bookmarks panel refreshes, tab switches to 'bookmarks', success AI-log emitted)
    - **EXPECTED OUTCOME**: Tests PASS (confirms the full bookmark save flow is intact)
    - _Requirements: 3.2_

- [~] 8. Checkpoint — Ensure all tests pass
  - Re-run the complete test suite: `npm test`
  - Confirm all five bug condition exploration tests now PASS (bugs are fixed)
  - Confirm all five preservation property tests still PASS (no regressions)
  - Run `npx tsc --noEmit` and confirm zero TypeScript errors across all renderer components
  - Verify the app starts in dev mode: `npm run dev` (run manually in terminal)
  - Ensure all tests pass. Ask the user if any questions arise.

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1", "2"] },
    { "wave": 2, "tasks": ["3.1", "4.1", "5.1", "6.1", "7.1"] },
    { "wave": 3, "tasks": ["3.2", "4.2", "5.2", "6.2", "7.2"] },
    { "wave": 4, "tasks": ["3.3", "4.3", "5.3", "6.3", "7.3"] },
    { "wave": 5, "tasks": ["3.4", "4.4", "5.4", "6.4", "7.4"] },
    { "wave": 6, "tasks": ["4.5", "5.5", "6.5", "7.5"] },
    { "wave": 7, "tasks": ["8"] }
  ]
}
```

Tasks 3–7 are independent of each other and can be executed in any order after tasks 1 and 2. Task 8 requires all prior tasks to be complete.

## Notes

- Tasks 1 and 2 MUST be completed before any fix is applied. The exploration tests should fail on unfixed code — this is expected and confirms the bugs exist.
- Preservation tests (task 2) should pass on unfixed code — this establishes the behavioral baseline.
- Each fix group (3–7) is self-contained and can be worked on independently.
- Gap 4 (TypeScript types) has no runtime effect — it is a compile-time fix only. `tsc --noEmit` is the validation command.
- Gap 3 (packaging) only needs `npm run package` to be runnable; actually producing a full installer is optional for CI but should be verified on a developer machine.
- The bookmark modal (Gap 5) is fully encapsulated in `OperatorConsole.tsx` — no changes to `BibleBrowser.tsx` or `SearchPanel.tsx` are needed.
