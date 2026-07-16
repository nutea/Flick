# flick-native

An in-repo native runtime package for Flick.

This package is intended to be a clean-room implementation of the native
capabilities Flick actually needs, without depending on the upstream
`flick-native` package design or release process.

## Goals

1. Own the API boundary used by this repository.
2. Implement only the native capabilities that Flick needs.
3. Prefer Windows-first delivery, then expand to macOS and Linux.
4. Avoid coupling app code to third-party native package APIs.

## Planned Capability Areas

- folder open path detection
- active window inspection
- keyboard simulation
- input event subscription
- clipboard helpers

## Current Module Layout

- `src/system`
  Windows/macOS/Linux system-facing capabilities such as folder path detection
  and active window lookup.
- `src/input`
  Keyboard simulation and global input event subscription.
- `src/clipboard`
  Clipboard-facing helpers exposed through a stable package API.
- `src/shared`
  Shared internal helpers used by the package implementation.
- `native/`
  Reserved for clean-room Rust/N-API implementations. The first scaffold is for
  Windows active window lookup. A local loader and build scripts now exist, and
  the package build will auto-compile the addon when Rust is available.

## Initial Migration Targets

1. `@nut-tree/nut-js` removed: Windows `SendInput` via N-API; macOS `osascript`; Linux `xdotool` when available
2. ~~Evaluate replacing `uiohook-napi`~~ (done on Windows: `WH_KEYBOARD_LL` / `WH_MOUSE_LL` in `native/`; non-Windows `startInputHook` is a no-op until a platform hook is added)
3. Windows Explorer folder path now uses the in-repo N-API (`ShellWindows` / `IWebBrowser2`) instead of `cdwhere.exe`

## Design Rules

1. Export stable project-owned types.
2. Hide platform-specific implementation details behind small adapters.
3. Do not expose third-party package return shapes directly.
4. Listener APIs must support unsubscribe from day one.

## Current Status

The package is now wired into the repository as the project-owned native API
boundary for the currently migrated capabilities.

Current integration status:

- superx copy shortcut now routes through `input.sendCopyShortcut`
- superx active-window fallback now routes through `system.getActiveWindow`
- main-process double-press shortcut handling now routes through
  `input.onInputEvent`
- superx mouse trigger handling now routes through `input.onInputEvent`
- main-process keyboard tap simulation now routes through
  `input.sendKeyboardTap`

Current intentionally retained fallbacks:

- `clipboard.writeFilePaths` falls back to Electron `clipboard.writeBuffer`
  (via `src/main/common/windowsClipboard.ts`) when the native addon is
  unavailable in a developer environment without a Rust toolchain

Implemented first:

- `input.sendCopyShortcut`
  Sends `Command + C` on macOS and `Control + C` elsewhere without `@nut-tree/nut-js`:
  Windows uses the N-API `sendKeyboardChord` (`SendInput`); macOS uses `osascript`
  + System Events; Linux uses `xdotool` when installed and an X session is present.
- `input.sendKeyboardTap`
  Same stack as `sendCopyShortcut`, with a small canonical key/modifier map for
  IPC callers (letters, digits, `F1`–`F24`, arrows, Enter, Tab, Space, etc.).
- `input.onInputEvent`
  On **Windows**, global keyboard/mouse/wheel events come from low-level hooks in
  the N-API addon (`startInputHook` → JSON payloads → `NativeInputEvent`). On
  other platforms the exported `startInputHook` currently installs no native
  listener (no events) until a macOS/Linux implementation lands.
- `system.getActiveWindow`
  The current implementation now uses the package-owned Windows native binding
  directly and returns `null` on non-Windows platforms for now.
- `system.getFolderOpenPath`
  Windows resolves the foreground Explorer folder (or last `file:` folder among
  open shell windows) via COM in `native/`, exposed as `getFolderOpenPath` on the
  N-API addon. Requires a successful native build; otherwise returns an empty
  string.
- `clipboard.getClipboardContent`
  Reads from Electron's clipboard and returns:
  - `file` when file paths are present
  - `text` when plain text is present
  - `null` otherwise
  Windows file-path reads now go through the in-repo N-API
  (`readClipboardFilePaths` → `CF_HDROP` + `DragQueryFileW`); macOS still uses
  Electron's pasteboard formats.
- `clipboard.readFilePaths` / `clipboard.writeFilePaths`
  Synchronous Windows file-clipboard helpers backed by `CF_HDROP` (with
  `Preferred DropEffect = COPY`) in the native addon. These replace the legacy
  `electron-clipboard-ex` dependency.

First implementation targets:

1. business-layer integration and verification
2. preserving existing behavior while shrinking direct app-level dependencies

## Native Build

The native layer is still optional. `pnpm --filter flick-native run build`
will attempt to compile it automatically when `cargo` is available. You can
also build the Windows addon manually with:

```bash
pnpm --filter flick-native run native:build
```

This compiles the Rust crate and copies the resulting addon to:

- `packages/flick-native/native/flick_native.node`

At runtime, the TypeScript layer will:

1. use the native addon on Windows by default
2. return `null` when the addon is unavailable or when running on a platform
   that does not yet have an in-repo implementation

When the target `.node` file is locked by a running process, the build script
now keeps the existing addon file instead of failing the whole package build.
