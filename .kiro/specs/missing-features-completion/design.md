# Missing Features Completion — Bugfix Design

## Overview

The Scripture Presenter Electron app has five implementation gaps where scaffolding exists but the logic was either stubbed out, discarded, or left entirely unwritten. None of these require new architecture — each fix is surgical and self-contained:

1. **Gap 1 — QR Code Not Rendered**: `QRCode.toDataURL()` is called but the resolved data URL is discarded (`.then(() => {})`). Fix: capture the result into a React state variable and render it as an `<img>` in the settings/network-info area.
2. **Gap 2 — Whisper Fallback Unused**: When `window.SpeechRecognition` is absent, `startSpeechRecognition()` logs a warning and returns. Fix: add a Whisper HTTP streaming fallback that reads `whisperUrl` from settings.
3. **Gap 3 — No electron-builder Config**: `electron-builder` is absent from `package.json` and no `electron-builder.json` exists. Fix: add the dependency, configuration file, and `package`/`dist:win` npm scripts.
4. **Gap 4 — Incomplete `window.api` Types**: `vite-env.d.ts` declarations mostly match `preload.ts` but several parameters and return types use `any` where concrete types are knowable. Fix: audit every method in `preload.ts` and sharpen the types in `vite-env.d.ts`.
5. **Gap 5 — Bookmark Labels Always Empty**: `addBookmark` in `OperatorConsole.tsx` hard-codes `label: ''`. Fix: add an inline prompt (modal or inline input) that collects a label before calling the API.

The fix strategy for each gap is minimal: change only what is broken, preserve all surrounding behavior, and confirm correctness through the testing strategy below.

---

## Glossary

- **Bug_Condition (C)**: A predicate over an input or system state that identifies when defective behavior is observed.
- **Property (P)**: The desired correct behavior that the fixed code must satisfy for all inputs satisfying C.
- **Preservation**: All behavior for inputs NOT satisfying C must remain byte-for-byte identical before and after the fix.
- **F**: The original (unfixed) function or system state.
- **F'**: The fixed function or system state.
- **qrDataUrl**: React state variable in `OperatorConsole` holding the base64 PNG data URL produced by `QRCode.toDataURL()`.
- **whisperUrl**: Persisted setting (`electron-store` key `whisperUrl`) holding the HTTP endpoint of a locally-running Whisper server.
- **startSpeechRecognition()**: The function in `OperatorConsole.tsx` that initialises speech-to-text. Currently exits early if `window.SpeechRecognition` is absent.
- **addBookmark()**: The async helper in `OperatorConsole.tsx` (and propagated as `onAddBookmark` prop to `BibleBrowser` and `SearchPanel`) that persists a bookmark to SQLite.
- **preload surface**: The full set of methods exposed via `contextBridge.exposeInMainWorld('api', {...})` in `src/main/preload.ts`.
- **electron-builder**: The npm package that packages an Electron app into distributable platform installers.

---

## Bug Details

### Gap 1 — QR Code Not Rendered

The bug manifests whenever the Operator Console loads and `getNetworkInfo()` resolves with a non-null result. `QRCode.toDataURL()` is invoked and its resolved data URL is silently discarded.

**Formal Specification:**
```
FUNCTION isBugCondition_QR(X)
  INPUT:  X = { networkInfo: { ip, port, pin } | null }
  OUTPUT: boolean

  RETURN X.networkInfo IS NOT null
     AND QRCode.toDataURL(url) HAS been called
     AND state.qrDataUrl = null   // result was discarded
END FUNCTION
```

**Examples:**
- Operator Console loads, LAN IP is `192.168.1.10`, port `3000` — `QRCode.toDataURL('http://192.168.1.10:3000/?view=remote')` resolves with a valid data URL, but `.then(() => {})` discards it. The settings panel shows no QR code image.
- Operator Console loads, network unavailable (`networkInfo = null`) — `QRCode.toDataURL` is never called; this is the non-buggy path and must be preserved.

---

### Gap 2 — Whisper Fallback Unused

The bug manifests when `startSpeechRecognition()` is called and `window.SpeechRecognition` (and `window.webkitSpeechRecognition`) are both `undefined` — the normal scenario inside a sandboxed Electron renderer on many systems.

**Formal Specification:**
```
FUNCTION isBugCondition_Whisper(X)
  INPUT:  X = runtime environment snapshot
  OUTPUT: boolean

  RETURN (window.SpeechRecognition = undefined)
     AND (window.webkitSpeechRecognition = undefined)
     AND isRecording = true   // microphone has been started
END FUNCTION
```

**Examples:**
- User starts microphone on a system where Web Speech API is unavailable — function logs warning and returns. No audio is transcribed; no error is shown to the operator. `whisperUrl` setting (`http://localhost:8080`) is never read.
- User starts microphone on a system where Web Speech API is available — existing path runs unchanged (preservation).

---

### Gap 3 — No Packaging Configuration

The bug manifests any time a developer attempts to produce a distributable build. There is no `electron-builder` in `package.json` and no configuration file.

**Formal Specification:**
```
FUNCTION isBugCondition_Packaging(X)
  INPUT:  X = project directory state
  OUTPUT: boolean

  RETURN ("electron-builder" NOT IN package.json.devDependencies)
      OR (electron-builder.json DOES NOT EXIST in project root)
      OR ("package" NOT IN package.json.scripts)
END FUNCTION
```

**Examples:**
- Developer runs `npm run package` — npm reports "missing script: package". No installer is produced.
- Developer manually runs `npx electron-builder` — fails because no config file is found and `electron-builder` is not installed.

---

### Gap 4 — Incomplete `window.api` TypeScript Declarations

The bug manifests when a renderer component calls a `window.api` method whose parameter or return type is typed as `any` when a concrete, knowable type exists, or when the declaration diverges from `preload.ts`.

**Formal Specification:**
```
FUNCTION isBugCondition_Types(X)
  INPUT:  X = method signature in preload.ts
  OUTPUT: boolean

  RETURN (X NOT IN vite-env.d.ts Window.api)
      OR (X.parameter typed as any WHERE concrete type IS determinable)
      OR (X.returnType typed as any WHERE concrete type IS determinable)
END FUNCTION
```

**Examples:**
- `addBookmark(bookmark: any)` — the bookmark shape is fully known from `OperatorConsole.tsx`; `any` hides type errors.
- `queryVerses` query parameter uses `any[]` return — verse shape is consistent across all call sites.
- `onProjectUpdate` callback `data` parameter is `any` where the projected-verse shape `{ reference, text, translation }` is known.
- All IPC listener return types (`onProjectUpdate`, `onClearScreen`, etc.) correctly return `() => void` cleanup functions — these are already typed correctly and must not change.

---

### Gap 5 — Bookmark Labels Always Empty

The bug manifests whenever `addBookmark()` is called from `BibleBrowser` or `SearchPanel`. The implementation hard-codes `label: ''` without presenting any UI to the user.

**Formal Specification:**
```
FUNCTION isBugCondition_Label(X)
  INPUT:  X = addBookmark() invocation context
  OUTPUT: boolean

  RETURN X.label = ''
     AND no_user_input_was_presented = true
END FUNCTION
```

**Examples:**
- User selects John 3:16 in Bible Browser and clicks "Bookmark" — bookmark saved immediately with `label: ''`; user never had a chance to type a label.
- User searches "grace" in Search Panel and clicks "Bookmark" on a result — same issue.
- User opens Bookmarks panel — all entries show blank labels with no way to distinguish them.

---

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors (must survive every fix):**
- Web Speech API path in `startSpeechRecognition()` must remain byte-for-byte unchanged when `window.SpeechRecognition` or `window.webkitSpeechRecognition` is defined (Requirement 3.1).
- Bookmark save flow — IPC call to `window.api.addBookmark`, `setBookmarksRefresh`, `setRightTab('bookmarks')`, and AI-log success entry — must remain intact regardless of label value (Requirement 3.2).
- `npm run dev` using Vite + vite-plugin-electron must continue to work without electron-builder being present at runtime (Requirement 3.3).
- The LAN Remote IP/port/PIN badge in the `<header>` must not be modified when the QR code `<img>` is added (Requirement 3.4).
- `tsc` must produce zero errors across all eight renderer components after updating `vite-env.d.ts` (Requirement 3.5).

**Scope:**
All inputs that do NOT satisfy each respective bug condition are out-of-scope for each fix and must behave identically before and after the change.

---

## Hypothesized Root Cause

### Gap 1 — QR Code Discard

The `.then(() => {})` callback was a deliberate placeholder comment ("Optional: keep if you want to use the QR code later"). The developer wired the generation call but deferred the state storage and UI rendering steps indefinitely. There is no state variable `qrDataUrl` declared in the component.

### Gap 2 — Whisper Fallback

The stub comment ("Local offline fallback not fully implemented") indicates the developer planned the fallback but never wrote it. The Whisper HTTP API (`/inference` endpoint, multipart audio upload) requires non-trivial audio plumbing that was deferred. The `whisperUrl` setting exists and is persisted, so the configuration surface is complete.

### Gap 3 — Packaging Config

`electron-builder` was never added to the project. The app uses `vite-plugin-electron` for dev mode, which does not depend on `electron-builder`. Because the app ran fine in development, the packaging step was simply never implemented.

### Gap 4 — Stale Type Declarations

`vite-env.d.ts` was likely written at an early stage of development and not kept in sync as `preload.ts` evolved. The bookmark shape, projected-verse shape, and several IPC return types that were `any` at authoring time remain `any` even though the concrete shapes are now stable.

### Gap 5 — Hard-coded Empty Label

The `addBookmark` helper in `OperatorConsole.tsx` was scaffolded to wire the IPC call but the UI affordance (dialog or inline input) was left as a TODO. `BibleBrowser` and `SearchPanel` both call `onAddBookmark` as a prop callback, so the label-collection UI belongs in `OperatorConsole` at the point where it calls `window.api.addBookmark`, keeping the child components free of modal state.

---

## Correctness Properties

Property 1: Bug Condition — QR Code Stored and Rendered

_For any_ network info resolution where `networkInfo` is non-null and `QRCode.toDataURL()` resolves successfully, the fixed `OperatorConsole` SHALL store the resolved data URL in state (`qrDataUrl`) and render a visible `<img src={qrDataUrl}>` element in the settings/network-info section.

**Validates: Requirements 2.1**

---

Property 2: Bug Condition — Whisper Fallback Activated

_For any_ runtime environment where `window.SpeechRecognition` and `window.webkitSpeechRecognition` are both undefined and the microphone is active, the fixed `startSpeechRecognition()` SHALL either (a) connect to the `whisperUrl` endpoint and stream audio for transcription, or (b) display a clear actionable error message to the operator naming the required local Whisper server URL.

**Validates: Requirements 2.2**

---

Property 3: Bug Condition — Packaging Command Produces Installer

_For any_ invocation of `npm run package` (or `npm run dist:win`) on the fixed project, the system SHALL produce a working NSIS `.exe` installer in the `release/` output directory using a valid `electron-builder.json` configuration with the correct `appId`, `productName`, asset paths, and `asar: true`.

**Validates: Requirements 2.3**

---

Property 4: Bug Condition — Complete window.api Type Coverage

_For any_ renderer component that accesses `window.api`, the fixed `vite-env.d.ts` SHALL enforce full TypeScript type safety such that `tsc` reports zero diagnostic errors, no method exposed in `preload.ts` is absent from the declaration, and no method uses `any` where a concrete type is determinable.

**Validates: Requirements 2.4**

---

Property 5: Bug Condition — Bookmark Label Collected from User

_For any_ "Add Bookmark" action initiated by the user in `BibleBrowser` or `SearchPanel`, the fixed `addBookmark()` flow SHALL present a label input (pre-populated with the verse reference) before calling `window.api.addBookmark`, and SHALL save the bookmark with the label value the user confirmed (which may be empty only if the user deliberately left it blank).

**Validates: Requirements 2.5**

---

Property 6: Preservation — Web Speech API Path Unchanged

_For any_ runtime where `window.SpeechRecognition` or `window.webkitSpeechRecognition` is defined, the fixed `startSpeechRecognition()` SHALL produce exactly the same behavior as the original — initialising `SpeechRecognition` with `continuous: true`, `interimResults: true`, `lang: 'en-US'`, and the same `onresult`/`onerror`/`onend` handlers.

**Validates: Requirements 3.1**

---

Property 7: Preservation — Bookmark IPC Flow Unchanged

_For any_ `addBookmark()` call that completes (regardless of label value), the fixed code SHALL still invoke `window.api.addBookmark`, call `setBookmarksRefresh(prev => prev + 1)`, call `setRightTab('bookmarks')`, and emit a success AI-log entry.

**Validates: Requirements 3.2**

---

Property 8: Preservation — Dev Mode Unaffected

_For any_ invocation of `npm run dev`, the fixed project SHALL continue to start using Vite and vite-plugin-electron without requiring `electron-builder` to be installed or configured.

**Validates: Requirements 3.3**

---

Property 9: Preservation — Header Badge Unmodified

_For any_ state where `networkInfo` is non-null, the fixed `OperatorConsole` header SHALL continue to render the LAN Remote IP, port, and PIN badge identically to the original, with no layout or content changes.

**Validates: Requirements 3.4**

---

Property 10: Preservation — Zero TypeScript Compile Errors

_For any_ `tsc` invocation after updating `vite-env.d.ts`, all eight renderer components (`App.tsx`, `OperatorConsole.tsx`, `ProjectionScreen.tsx`, `MobileRemote.tsx`, `BibleBrowser.tsx`, `SearchPanel.tsx`, `ServiceSchedule.tsx`, `BookmarksPanel.tsx`) SHALL compile without errors.

**Validates: Requirements 3.5**

---

## Fix Implementation

### Gap 1 — QR Code Display

**File:** `src/renderer/components/OperatorConsole.tsx`

**Changes:**
1. **Add state variable**: `const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);`
2. **Capture the resolved URL**: Replace `.then(() => {})` with `.then((dataUrl: string) => setQrDataUrl(dataUrl))`.
3. **Render the image**: In the settings tab (right pane), within the network info section, add:
   ```tsx
   {qrDataUrl && (
     <div className="mt-3">
       <p className="text-xs text-muted-foreground font-semibold mb-1">Scan to connect mobile remote:</p>
       <img src={qrDataUrl} alt="QR Code for mobile remote" className="w-32 h-32 rounded border border-border" />
     </div>
   )}
   ```
4. **No changes** to the existing header badge block that renders `networkInfo.ip`, `networkInfo.port`, and `networkInfo.pin`.

---

### Gap 2 — Whisper Fallback

**File:** `src/renderer/components/OperatorConsole.tsx`

**Changes:**
1. **Add state**: `const [whisperSessionActive, setWhisperSessionActive] = useState(false);` and a ref `const mediaRecorderRef = useRef<MediaRecorder | null>(null);`.
2. **Replace the stub**: When `SpeechRecognition` is absent, attempt to use `MediaRecorder` to chunk audio and POST it to `${whisperUrl}/inference` as multipart form data. On success, parse the Whisper JSON response (`{ text: string }`) and pipe it into the existing `setTranscript` / `triggerAIDetectionDebounce` flow.
3. **Graceful error handling**: If the `fetch` to `whisperUrl` fails (network error or non-2xx), call `addAiLog('error', \`Whisper server unreachable at ${whisperUrl}. Start the local Whisper server or check the URL in Settings.\`)` and set `isRecording(false)`.
4. **Stop path**: `stopSpeechRecognition()` must also stop and null the `MediaRecorder` ref.
5. **No changes** to the `if (SpeechRecognition)` branch — it is entered and executed exactly as before.

---

### Gap 3 — electron-builder Configuration

**Files:** `package.json` (root), new `electron-builder.json` (root)

**Changes:**

1. **Add devDependency** to `package.json`:
   ```json
   "electron-builder": "^24.9.1"
   ```
2. **Add scripts** to `package.json`:
   ```json
   "package": "npm run build && electron-builder",
   "dist:win": "npm run build && electron-builder --win"
   ```
3. **Create `electron-builder.json`**:
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
       "target": "nsis",
       "icon": "src/renderer/assets/icon.ico"
     },
     "nsis": {
       "oneClick": false,
       "allowToChangeInstallationDirectory": true
     }
   }
   ```
   Note: if no icon file exists, the `icon` field should be omitted or a placeholder used; the build must not fail on missing assets.
4. **No changes** to `vite.config.ts`, `vite-plugin-electron` setup, or the `dev`/`build` scripts.

---

### Gap 4 — window.api Type Declarations

**File:** `src/renderer/vite-env.d.ts`

**Changes** — sharpen `any` types to concrete shapes where the type is fully determinable from the codebase:

1. **Define shared interfaces** above the `Window` interface:
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

2. **Update method signatures** in `Window.api`:
   - `queryVerses`: `(query: VerseQuery) => Promise<VerseResult[]>`
   - `parseReference`: `(refStr: string) => Promise<ParsedReference | null>`
   - `searchText`: `(translation: string, query: string, limit?: number) => Promise<VerseResult[]>`
   - `getBookmarks`: `() => Promise<BookmarkRecord[]>`
   - `addBookmark`: `(bookmark: Omit<BookmarkRecord, 'id'>) => Promise<number>`
   - `getTranslations`: `() => Promise<TranslationRecord[]>`
   - `getSettings`: `() => Promise<AppSettings>`
   - `setSettings`: `(key: keyof AppSettings, value: AppSettings[keyof AppSettings]) => Promise<AppSettings>`
   - `getNetworkInfo`: `() => Promise<NetworkInfo | null>`
   - `onProjectUpdate`: `(callback: (event: Electron.IpcRendererEvent, data: ProjectionData) => void) => () => void`
   - `onClearScreen`: `(callback: () => void) => () => void`
   - `onStatusUpdate`: `(callback: (event: Electron.IpcRendererEvent, status: Partial<AppSettings> & { blackout?: boolean }) => void) => () => void`
   - `onVUUpdate`: `(callback: (event: Electron.IpcRendererEvent, value: number) => void) => () => void`
   - `onAILog`: `(callback: (event: Electron.IpcRendererEvent, data: { type: 'info' | 'success' | 'warning' | 'error'; message: string }) => void) => () => void`
   - `onAISuggestion`: `(callback: (event: Electron.IpcRendererEvent, data: ProjectionData) => void) => () => void`
   - `forceProject`: `(verseData: ProjectionData) => void`
   - `broadcastStatus`: `(status: Partial<AppSettings> & { blackout?: boolean }) => void`
   - `exportSessionPdf`: `(verses: ProjectionData[]) => Promise<boolean>` — note: `ExportedVerse` in `pdf-export.ts` has `reference`, `text`, `translation` matching `ProjectionData`.

3. **Leave unchanged**: `getBooks`, `getChapterCount`, `getVerseCount`, `removeBookmark`, `downloadTranslation`, `importTranslationFile`, `deleteTranslation`, `saveSchedule`, `loadSchedule`, `clearProject`, `sendTranscript` — these are already correctly or acceptably typed given that some involve dialog interactions with inherently loose types.

---

### Gap 5 — Bookmark Label UI

**File:** `src/renderer/components/OperatorConsole.tsx`

**Changes:**
1. **Add state for pending bookmark**:
   ```typescript
   const [pendingBookmark, setPendingBookmark] = useState<{
     book: string; chapter: number; verseStart: number; verseEnd?: number; text: string;
   } | null>(null);
   const [bookmarkLabel, setBookmarkLabel] = useState('');
   ```
2. **Change `addBookmark` to a two-step flow**:
   - Rename the current `addBookmark` helper to `confirmBookmark`.
   - Replace `addBookmark` with a function that sets `pendingBookmark` and pre-populates `bookmarkLabel` with the verse reference string (e.g., `"John 3:16"`).
3. **Add a modal overlay** (rendered at the root of the `OperatorConsole` return, above all other content):
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
4. **`confirmBookmark`** calls the original IPC flow:
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
5. **No changes** to `BibleBrowser.tsx` or `SearchPanel.tsx` — they call `onAddBookmark` as before; the label-collection step is entirely encapsulated in `OperatorConsole`.

---

## Testing Strategy

### Validation Approach

Testing follows a two-phase approach for each gap:

1. **Exploratory / Bug Condition Checking** — run tests against the _unfixed_ code to observe failures and confirm root cause hypotheses.
2. **Fix + Preservation Checking** — after applying each fix, run the same tests against the _fixed_ code to verify correctness and run preservation tests to confirm no regressions.

---

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples demonstrating each bug on unfixed code before implementing the fix.

**Test Cases — Gap 1 (QR)**:
1. Mount `OperatorConsole` with a mocked `getNetworkInfo` that returns `{ ip: '10.0.0.1', port: 3000, pin: '1234' }`. Assert that the rendered DOM contains an `<img>` element with `src` matching `data:image/png`. Expected: fails (no `<img>` rendered).

**Test Cases — Gap 2 (Whisper)**:
2. Call `startSpeechRecognition()` in an environment where `window.SpeechRecognition = undefined`. Assert that a `fetch` call to `http://localhost:8080/inference` is made. Expected: fails (function returns after logging warning).
3. Call `startSpeechRecognition()` same as above; assert that `addAiLog` is called with `type: 'error'` if the endpoint is unreachable. Expected: fails (no error log of this type emitted).

**Test Cases — Gap 3 (Packaging)**:
4. Inspect `package.json` programmatically. Assert `"electron-builder"` is in `devDependencies`. Expected: fails.
5. Assert `"package"` is in `scripts`. Expected: fails.
6. Assert `electron-builder.json` exists in project root. Expected: fails.

**Test Cases — Gap 4 (Types)**:
7. Run `tsc --noEmit` and pipe results. Assert zero errors. Expected: currently passes (types are loose but not wrong); this test establishes baseline and tightens as types are improved.
8. Write a typed test file that assigns `window.api.queryVerses` result directly to `VerseResult[]` without casting. Expected: fails (return type is currently `Promise<any[]>`).

**Test Cases — Gap 5 (Bookmark Label)**:
9. Simulate clicking "Bookmark" on a verse in `BibleBrowser`. Assert that a modal/input is present in the DOM before `window.api.addBookmark` is called. Expected: fails (IPC is called immediately, no modal rendered).
10. Simulate clicking "Bookmark" and assert `window.api.addBookmark` is called with `label !== ''` when a non-empty label is provided. Expected: fails (label is always `''`).

**Expected Counterexamples:**
- No `<img>` element with a `data:` src in the settings panel.
- `fetch` to `whisperUrl` is never called when Web Speech API is absent.
- `package.json` missing `electron-builder` and `package` script; config file absent.
- `window.api.addBookmark` called immediately without user input.

---

### Fix Checking

**Goal**: Verify that for all inputs where each bug condition holds, the fixed code produces the expected behavior.

**Pseudocode (generalised):**
```
FOR ALL input WHERE isBugCondition_N(input) DO
  result := fixedFunction(input)
  ASSERT property_N(result)
END FOR
```

**Per-gap assertions after fix:**
- Gap 1: `qrDataUrl` state is non-null; DOM contains `<img src={qrDataUrl}>`.
- Gap 2: `fetch` is called with `whisperUrl + '/inference'`; on success transcript updates; on failure an actionable error log appears.
- Gap 3: `electron-builder.json` is valid JSON with required fields; `npm run package` exits 0 and produces a file in `release/`.
- Gap 4: `tsc --noEmit` exits 0; targeted typed assignments compile without cast.
- Gap 5: Clicking "Bookmark" renders modal; submitting with a label calls `window.api.addBookmark` with `label === userEnteredValue`.

---

### Preservation Checking

**Goal**: Verify that for all inputs where each bug condition does NOT hold, the fixed code produces the same result as the original.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition_N(input) DO
  ASSERT F(input) = F'(input)
END FOR
```

**Property-based testing is particularly valuable here** because:
- It generates many varied inputs automatically, catching edge cases that manual tests miss.
- It provides high confidence that non-buggy paths are truly unchanged.

**Per-gap preservation tests:**
- Gap 1: When `networkInfo = null`, no `QRCode.toDataURL` call is made, and the header badge is unchanged.
- Gap 2: When `window.SpeechRecognition` is defined, `startSpeechRecognition()` behaves identically to the original — same `continuous`, `interimResults`, `lang`, same event handlers.
- Gap 3: `npm run dev` and `npm run build` are unaffected; no packaging-only code runs in the dev path.
- Gap 4: All eight renderer components compile after type updates; no runtime behavior changes (types are erased at runtime).
- Gap 5: After the modal is confirmed, the full IPC + refresh + tab switch + AI-log flow runs exactly as before.

---

### Unit Tests

- `OperatorConsole` QR: mock `QRCode.toDataURL`, assert state update and `<img>` render.
- `OperatorConsole` Whisper: mock `window.SpeechRecognition = undefined`, mock `fetch`, assert fetch is called to `whisperUrl/inference`.
- `OperatorConsole` Whisper error: mock `fetch` to throw, assert error AI-log is emitted and recording stops.
- `OperatorConsole` Bookmark modal: assert modal visible after `onAddBookmark` callback, assert `window.api.addBookmark` not called until confirm, assert called with correct label on confirm, assert not called on cancel.
- `package.json` shape: assert required fields and scripts exist.
- `electron-builder.json` shape: assert required fields (`appId`, `productName`, `directories.output`, `win.target`, `asar`) are present.

### Property-Based Tests

- **QR Preservation** (Property 9): For any `networkInfo` value, the rendered header badge text is identical before and after the fix.
- **Whisper Speech API Preservation** (Property 6): Generate random transcript strings; when `SpeechRecognition` is available, the fixed `startSpeechRecognition` produces the same `onresult` handler behavior as the original.
- **Bookmark IPC Preservation** (Property 7): For any `(book, chapter, verseStart, verseEnd, label)` tuple, the fixed `confirmBookmark` always calls `window.api.addBookmark` exactly once, then `setBookmarksRefresh`, then `setRightTab('bookmarks')`, then adds a success log.
- **Type Coverage** (Property 4): For every method name in `preload.ts`, assert it is present as a key in the `Window.api` declaration and its parameter types resolve to non-`any` concrete types.

### Integration Tests

- Full bookmark flow: `BibleBrowser` → select verse → click "Bookmark" → modal appears → enter label → confirm → `BookmarksPanel` refreshes and shows the new bookmark with the entered label.
- Full QR flow: Operator Console loads with real network info → QR code visible in settings tab → header badge unchanged.
- Packaging: `npm run package` on CI/dev machine → `release/` directory contains a `.exe` file.
- TypeScript: `npm run build` (which runs `tsc && vite build`) exits 0 with no errors after type declaration updates.
- Whisper fallback (manual/integration): disable Web Speech API, start microphone, speak → transcript appears via Whisper; OR error message names the `whisperUrl` if server is not running.
