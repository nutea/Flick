# Native Runtime

This directory contains the clean-room native implementation for `flick-native`.

Current status:

- Rust/N-API scaffold is in place
- workspace package build can compile the addon automatically when Rust is
  available
- the binding is optional at runtime and implements the same API across Windows,
  macOS, and Linux

The TypeScript layer treats this binding as the preferred implementation on all
platforms and retains non-crashing fallbacks for development without Cargo.

Current Windows implementation target:

- `GetForegroundWindow`
- `GetWindowTextW`
- `GetWindowThreadProcessId`
- `GetWindowRect`
- `OpenProcess`
- `QueryFullProcessImageNameW`

Notes:

- the current build flow copies the compiled addon to
  `packages/flick-native/native/flick_native.node`
- if the binding is missing or fails at runtime, the TypeScript layer returns
  empty capability results or uses its Electron/platform-command fallback
- macOS global input and selected-text access require Accessibility permission
- macOS keyboard, wheel, and mouse input use a project-owned CoreGraphics event
  tap. This covers middle/auxiliary buttons and avoids performing keyboard
  input-source translation from the event-tap thread
- Linux global input currently targets X11; Wayland compositors can deny global
  event observation by design
- Linux file clipboard helpers use `wl-copy`/`wl-paste` on Wayland and `xclip`
  on X11; reads fall back to X11 helpers in mixed XWayland sessions
- addon copy may be skipped when the destination file is already locked by a
  running process; in that case the existing addon is kept
