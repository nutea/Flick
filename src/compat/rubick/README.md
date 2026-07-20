# Rubick compatibility boundary

This directory is the only owner of the legacy Rubick plugin contract.

- `preload.ts` exposes `window.rubick`, restores the removed legacy
  `electron.remote` export and audits the official preload API.
- `manifest.ts` converts legacy package metadata into Flick's canonical shape.
  Its `file` command translation is intentionally confined here; Flick's core
  protocol only supports `files`.
- `runtime.ts` owns legacy system-plugin aliases and runtime classification.
- `constants.ts` is the compatibility inventory and removal checklist.

Flick-native APIs must not be added here. When Rubick support is retired, remove
this directory and its imports; the rest of the application should continue to
operate on canonical Flick plugin objects.
