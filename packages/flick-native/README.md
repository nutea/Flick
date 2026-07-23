# flick-native

An in-repo native runtime package for Flick.

This package is intended to be a clean-room implementation of the native
capabilities Flick actually needs, without depending on the upstream
`flick-native` package design or release process.

## Goals

1. Own the API boundary used by this repository.
2. Implement only the native capabilities that Flick needs.
3. Keep Windows, macOS, and Linux behind the same behavior-oriented API.
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

1. `@nut-tree/nut-js` removed: Windows uses `SendInput`; macOS/Linux use the
   native event backend, with `osascript`/`xdotool` retained as build-free fallbacks
2. ~~Evaluate replacing `uiohook-napi`~~ (done: Windows uses `WH_KEYBOARD_LL` / `WH_MOUSE_LL`; macOS uses a CoreGraphics event tap; Linux uses an X11 global listener)
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
  Windows uses `SendInput`; macOS/Linux use the native event backend, with
  `osascript`/`xdotool` retained as command fallbacks.
- `input.sendKeyboardTap`
  Same stack as `sendCopyShortcut`, with a small canonical key/modifier map for
  IPC callers (letters, digits, `F1`–`F12`, arrows, Enter, Tab, Space, etc.).
- `input.onInputEvent`
  Global keyboard/mouse/wheel events come from the N-API addon
  (`startInputHook` → JSON payloads → `NativeInputEvent`). Windows uses Raw
  Input as the centralized mouse notification channel and low-level hooks for
  keyboard events, mouse-gesture suppression, and hook-health observation.
  macOS uses a project-owned CoreGraphics event tap for keyboard,
  wheel, and all mouse buttons, and Linux uses X11. The macOS listener avoids
  background-thread keyboard-layout translation, which is unsafe on current
  macOS releases. macOS
  requires Accessibility permission; Wayland compositors may intentionally
  deny global input observation.
- `system.getActiveWindow`
  Returns the foreground window title, owning application/process, path, PID,
  and geometry on Windows, macOS, and Linux (X11, KDE, and supported Hyprland
  sessions).
- `system.captureSelection`
  Captures the trigger-time source window, accessible text, Explorer/Finder
  selection, current file-manager folder, native file metadata, truncation
  state, and timing diagnostics in one snapshot. Windows captures HWNDs before
  queuing its N-API worker, queries Explorer with
  `IFolderView2::GetSelection(false)`, and caps native enumeration at 100 items.
  Callers may pass an `AbortSignal`.
- `system.getFolderOpenPath`
  Windows resolves the foreground Explorer folder (or last `file:` folder among
  open shell windows) via COM in `native/`, exposed as `getFolderOpenPath` on the
  N-API addon. macOS resolves Finder through automation; Linux uses the selected
  URI or an absolute file-manager window title when the desktop exposes one.
  Missing or unreliable desktop metadata returns an empty string.
- `clipboard.getClipboardContent`
  Reads from Electron's clipboard and returns:
  - `file` when file paths are present
  - `text` when plain text is present
  - `null` otherwise
    Windows file-path reads go through the in-repo N-API
    (`readClipboardFilePaths` → `CF_HDROP` + `DragQueryFileW`); macOS and Linux
    accept both native file-list results and Electron pasteboard formats.
- `clipboard.readFilePaths` / `clipboard.writeFilePaths`
  Windows uses `CF_HDROP` (with `Preferred DropEffect = COPY`), macOS uses Finder
  pasteboard file URLs, and Linux uses `text/uri-list` through the active X11 or
  Wayland clipboard helper. Electron-format reads remain as a build-free fallback.

## Platform parity

| Capability                    | Windows                     | macOS               | Linux                      |
| ----------------------------- | --------------------------- | ------------------- | -------------------------- |
| Active window metadata        | Win32                       | AppKit/CoreGraphics | X11/KDE/Hyprland           |
| Global key/mouse/wheel events | Raw Input + low-level hooks | event tap           | X11 listener               |
| Synthetic keyboard chords     | `SendInput`                 | CoreGraphics        | X11                        |
| Selected text                 | UI Automation               | Accessibility API   | primary selection          |
| File-manager folder/selection | Explorer COM                | Finder automation   | desktop-dependent fallback |
| File clipboard                | `CF_HDROP`                  | Finder URLs         | `text/uri-list`            |

Detailed selection architecture:

- [Windows Super Panel selection](../../docs/windows-super-panel-selection.md)
- [macOS Super Panel selection](../../docs/macos-super-panel-selection.md)

Linux desktop environments deliberately differ here. Under Wayland, global
input capture is compositor-controlled; clipboard operations prefer
`wl-clipboard` and fall back to X11 helpers in mixed XWayland sessions. Under
X11, install `xclip` (or `xsel` for selected text).

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

1. use the native addon on every supported platform by default
2. use Electron or platform-command fallbacks when the addon is unavailable

When the target `.node` file is locked by a running process, the build script
now keeps the existing addon file instead of failing the whole package build.
