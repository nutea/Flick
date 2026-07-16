English | [简体中文](./README.zh-CN.md)

# Flick

A plugin-based desktop productivity tool built with Electron, Vue, and a pnpm workspace monorepo.

This repository contains the desktop app shell and several sub-apps, including the main launcher, plugin market, detached window, onboarding page, and super panel. It is suitable as a base for launcher, plugin platform, and desktop workflow tooling development.

## Overview

Current modules in this repository:

- Main app: Electron main process, launcher UI, plugin loading, and window management
- `apps/feature`: plugin market and settings pages
- `apps/superx`: super panel
- `apps/detach`: detached window
- `apps/guide`: onboarding page
- `apps/tpl`: template page

## Tech Stack

- Electron
- Vue 3
- TypeScript
- Vite / electron-vite
- pnpm workspace

## Development

Install dependencies:

```bash
pnpm install
```

Start the main app in development mode:

```bash
pnpm serve
```

Start all sub-app dev servers together with the main app:

```bash
pnpm dev:all
```

Start only the sub-app dev servers:

```bash
pnpm dev:apps
```

## Build

Build the desktop application:

```bash
pnpm build
```

Build all sub-apps:

```bash
pnpm apps:build
```

Create a local installer package:

```bash
pnpm electron:build:local
```

## Release

GitHub Actions can build the Windows installer and publish it to GitHub Releases automatically when you push a version tag.

Recommended release flow:

```bash
git checkout main
git pull
git tag v5.0.0
git push origin main --tags
```

Notes:

- Tag format must be `v<package.json version>`, for example `v5.0.0`
- The workflow validates that the tag matches `package.json`
- Release assets include the installer `.exe`, `.blockmap`, and `latest.yml`

## Project Structure

```text
.
├─ src/                  main application source
├─ apps/
│  ├─ feature/           plugin market
│  ├─ superx/            super panel
│  ├─ detach/            detached window
│  ├─ guide/             onboarding
│  └─ tpl/               template page
├─ public/               static assets and build output
└─ electron-builder.yml  packaging config
```

## Open Source Notice

This project continues development based on the open-source project Rubick and keeps the necessary attribution information.

- Original project: Rubick
- Upstream repository: https://github.com/rubickCenter/rubick
- Original license: MIT

If you redistribute or further develop this project, please comply with the upstream license requirements.

## License

[MIT](./LICENSE)
