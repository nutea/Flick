# Native Skeleton

This directory is the future home of the clean-room native implementation for
`flick-native`.

Current status:

- Rust/N-API scaffold is in place
- workspace package build can compile the addon automatically when Rust is
  available
- the binding is optional at runtime and currently focused on Windows active
  window lookup

Planned first native target:

1. Windows active window lookup

The initial exported function shape is:

- `get_active_window() -> Option<ActiveWindowInfo>`

The TypeScript layer currently treats this binding as the default Windows
implementation.

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
- if the binding is missing or fails at runtime, the current TypeScript layer
  returns `null`
- non-Windows active-window support is not implemented yet
- addon copy may be skipped when the destination file is already locked by a
  running process; in that case the existing addon is kept
