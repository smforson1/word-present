# Bugfix Requirements Document

## Introduction

The Scripture Presenter Electron app has five incomplete or non-functional implementations that prevent features from working as intended. These are not new features — the scaffolding already exists — but the implementations are either stubbed out, wired to nothing, or entirely missing. The goal of this spec is to complete each gap so the application reaches a fully functional state for production use.

The five gaps are:

1. **QR code not rendered** — the QR data URL is generated and immediately discarded; it is never stored in state and never displayed.
2. **Whisper URL stored but unused** — the `whisperUrl` setting is saved but the offline speech-recognition fallback path only logs a warning and exits, leaving microphone-based recognition non-functional when the Web Speech API is unavailable.
3. **No electron-builder packaging config** — the app can be run in dev mode but cannot be packaged into a distributable Windows installer; `electron-builder` is absent from `package.json` and no configuration file exists.
4. **No `window.api` TypeScript declarations** — `window.api` is called throughout the renderer but `vite-env.d.ts` already contains the declarations; they need to be verified complete and accurate against the actual preload surface.
5. **Bookmark labels always empty** — `addBookmark` hard-codes `label: ''` with no UI for the user to enter a label before saving.

---

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the operator console loads and network info is available THEN the system calls `QRCode.toDataURL(url).then(() => {})` and discards the result, so the QR code image is never stored in state and no QR code is ever displayed in the UI.

1.2 WHEN the Web Speech API is unavailable in the Electron environment THEN the system logs the warning "Web Speech API not supported. Local offline fallback not fully implemented." and returns without starting any speech recognition, leaving microphone transcription completely broken.

1.3 WHEN a user attempts to package the app for distribution THEN the system has no `electron-builder` dependency, no `electron-builder.json` configuration, and no `package` or `dist:win` script in `package.json`, making it impossible to produce a distributable `.exe` or installer.

1.4 WHEN a renderer component accesses `window.api` with a method added after the initial type declaration was written THEN the system may produce TypeScript type errors or silently lose type safety because the declaration file does not fully mirror the preload bridge.

1.5 WHEN a user clicks "Add Bookmark" on any verse in the Bible Browser or Search Panel THEN the system saves the bookmark with `label: ''` hard-coded and no dialog or input field is presented, so every saved bookmark has a permanently blank label.

### Expected Behavior (Correct)

2.1 WHEN network info is available and the QR code URL is generated THEN the system SHALL store the resulting data URL in component state and render a visible `<img>` element displaying the QR code in the settings or network-info section of the Operator Console.

2.2 WHEN the Web Speech API is unavailable THEN the system SHALL attempt to connect to the configured `whisperUrl` endpoint and stream audio for transcription, or display a clear actionable error to the operator indicating that a local Whisper server must be running at the configured URL.

2.3 WHEN a developer runs a packaging command THEN the system SHALL use `electron-builder` with a valid `electron-builder.json` configuration targeting Windows (NSIS installer), with the correct `appId`, `productName`, asset directories, and `asar` bundling, producing a working `.exe` installer in a `release/` output directory.

2.4 WHEN any renderer component accesses `window.api` THEN the system SHALL enforce full TypeScript type safety through a complete `window.api` declaration in `vite-env.d.ts` that accurately reflects every method exposed in `preload.ts`, with no `any`-typed methods where a concrete type is knowable.

2.5 WHEN a user triggers "Add Bookmark" on a verse THEN the system SHALL present an inline input field or modal dialog pre-populated with the verse reference, allow the user to confirm or edit the label, and only then save the bookmark with the entered label (which may be empty only if the user explicitly leaves it blank).

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the Web Speech API is available in the runtime THEN the system SHALL CONTINUE TO use it as the primary speech recognition engine with no change to the existing `SpeechRecognition` initialization, continuous mode, interim results, and auto-restart behavior.

3.2 WHEN a bookmark is saved (with or without a label) THEN the system SHALL CONTINUE TO persist it to the SQLite database via `window.api.addBookmark`, refresh the bookmarks panel, switch the right tab to "bookmarks", and log a success AI-log entry.

3.3 WHEN the app is running in development mode via `npm run dev` THEN the system SHALL CONTINUE TO start correctly using Vite and vite-plugin-electron without requiring electron-builder.

3.4 WHEN the QR code section is added to the UI THEN the system SHALL CONTINUE TO display the LAN Remote IP, port, and PIN in the existing header badge without modification.

3.5 WHEN `window.api` type declarations are updated THEN the system SHALL CONTINUE TO compile without errors across all renderer components (`App.tsx`, `OperatorConsole.tsx`, `ProjectionScreen.tsx`, `MobileRemote.tsx`, `BibleBrowser.tsx`, `SearchPanel.tsx`, `ServiceSchedule.tsx`, `BookmarksPanel.tsx`).

---

## Bug Condition Pseudocode

### Gap 1 — QR Code Not Rendered

```pascal
FUNCTION isBugCondition_QR(X)
  INPUT: X = result of QRCode.toDataURL(url) Promise resolution
  OUTPUT: boolean
  RETURN X.dataUrl IS discarded AND component state qrDataUrl = null
END FUNCTION

// Fix Checking
FOR ALL X WHERE isBugCondition_QR(X) DO
  result ← generateAndStoreQR'(url)
  ASSERT state.qrDataUrl != null
  ASSERT rendered_img.src = state.qrDataUrl
END FOR

// Preservation Checking
FOR ALL X WHERE NOT isBugCondition_QR(X) DO
  ASSERT networkInfo header badge behavior = unchanged
END FOR
```

### Gap 2 — Whisper Fallback Unused

```pascal
FUNCTION isBugCondition_Whisper(X)
  INPUT: X = runtime environment
  OUTPUT: boolean
  RETURN SpeechRecognition IN window = false
END FUNCTION

// Fix Checking
FOR ALL X WHERE isBugCondition_Whisper(X) DO
  result ← startSpeechRecognition'(X)
  ASSERT whisperUrl IS read from settings
  ASSERT audio stream IS connected to whisper endpoint OR clear error IS shown
END FOR

// Preservation Checking
FOR ALL X WHERE NOT isBugCondition_Whisper(X) DO
  ASSERT F(X) = F'(X)  // Web Speech API path unchanged
END FOR
```

### Gap 3 — No Packaging Config

```pascal
FUNCTION isBugCondition_Packaging(X)
  INPUT: X = project directory state
  OUTPUT: boolean
  RETURN electron-builder NOT IN devDependencies
      OR electron-builder.json NOT EXISTS
      OR "package" script NOT IN package.json.scripts
END FUNCTION

// Fix Checking
FOR ALL X WHERE isBugCondition_Packaging(X) DO
  result ← runPackage'(X)
  ASSERT electron-builder.json EXISTS AND VALID
  ASSERT "package" script EXISTS in package.json
  ASSERT release/ output directory IS produced
END FOR
```

### Gap 4 — Missing window.api Types

```pascal
FUNCTION isBugCondition_Types(X)
  INPUT: X = method name exposed in preload.ts
  OUTPUT: boolean
  RETURN X NOT IN vite-env.d.ts Window.api declaration
      OR X has parameter typed as any WHERE concrete type IS knowable
END FUNCTION

// Fix Checking
FOR ALL X WHERE isBugCondition_Types(X) DO
  result ← tsc'()
  ASSERT no TypeScript diagnostic errors referencing window.api.X
END FOR
```

### Gap 5 — Bookmark Label Always Empty

```pascal
FUNCTION isBugCondition_Label(X)
  INPUT: X = addBookmark invocation
  OUTPUT: boolean
  RETURN X.label = '' AND no user input was collected
END FUNCTION

// Fix Checking
FOR ALL X WHERE isBugCondition_Label(X) DO
  result ← addBookmark'(X)
  ASSERT user WAS presented with label input before save
  ASSERT stored bookmark.label = user_entered_value
END FOR

// Preservation Checking
FOR ALL X WHERE NOT isBugCondition_Label(X) DO
  ASSERT bookmark IS still saved to db
  ASSERT bookmarks panel refreshes
  ASSERT right tab switches to 'bookmarks'
END FOR
```
