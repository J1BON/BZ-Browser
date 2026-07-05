# Cloud Antidetect Browser

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-0.5.0-green.svg)](package.json)

Open-source antidetect browser manager with **per-profile fingerprint isolation**, **Google Drive encrypted sync**, proxy rotation, RPA automation, and a REST API.

> Fork, contribute, and self-host. Built with Electron + React + TypeScript + Playwright.

## Features

- **True per-profile antidetect** — seeded canvas, WebGL, audio, fonts, client hints, TLS profiles
- **Profile isolation** — separate Chromium user-data per profile (cookies, storage)
- **Google Drive sync** — AES-256-GCM encrypted profile bundles
- **Proxy manager** — health checks, residential presets, rotation pools, geo alignment
- **Automation API** — REST on `:9321`, CDP endpoints, webhooks, API keys
- **Broearn import** — migrate existing antidetect profiles
- **Cross-platform** — Windows, macOS, Linux builds via GitHub Actions

## Quick start

### Prerequisites

- Node.js 20+
- Google Chrome or [patched Chromium](https://github.com/adium/fingerprint-chromium) (recommended for TLS spoofing)

### Install & run

```bash
git clone https://github.com/J1BON/cloud-antidetect-browser.git
cd cloud-antidetect-browser
npm install
npm run electron:dev
```

### Google Drive sync (optional)

1. Create a project at [Google Cloud Console](https://console.cloud.google.com/)
2. Enable **Google Drive API**
3. Create OAuth 2.0 credentials (Desktop app)
4. Copy `.env.example` → `.env` and fill in:

```env
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
```

5. In the app: **Settings → Connect Drive** → authorize → sync

## Build

```bash
npm run pack:win     # Windows NSIS installer
npm run pack:mac     # macOS DMG
npm run pack:linux   # AppImage + deb
```

Release builds are triggered by pushing a version tag:

```bash
git tag v0.5.0
git push origin v0.5.0
```

## Antidetect profile tips

1. **One profile = one identity** — never share profiles between accounts
2. **Always use a residential proxy** — assign before launch
3. **Install patched Chromium** — Settings → Install Patched Chromium (TLS/JA3). The app pins a tested release tag in `src/core/fingerprint/chromium-manifest.ts`; re-install when the pin bumps.
4. **Prefer Android/Windows/macOS** — iOS Safari UA on Chromium is flagged by anti-bot
5. **Validate before use** — Launch → Validate (85%+ score gate on new profiles). CI runs `test:core` + `test:injection` on every PR.

## Patched Chromium versioning

- Pinned release: see `CHROMIUM_MANIFEST.pinnedTag` in `src/core/fingerprint/chromium-manifest.ts`
- Install writes `chromium-install.json` with tag + version for drift detection
- Settings shows a warning when installed tag ≠ pinned tag
- Bump the pin only after validating TLS/JA3 and injection scores against CreepJS / BrowserLeaks

## Lawful use & abuse policy

This project is intended for **legitimate** purposes only:

- Privacy research and fingerprint hardening on systems you own or have permission to test
- Multi-account workflows where the platform explicitly permits separate identities
- QA automation and anti-bot regression testing with written authorization

**Do not use** this software to:

- Evade fraud detection, payment abuse, or identity verification you are not entitled to bypass
- Scrape, spam, or automate actions that violate a site's terms of service or applicable law
- Impersonate others or conduct credential stuffing, account takeover, or similar abuse

Maintainers may remove releases or restrict distribution if the project is used primarily for abuse. Report misuse via GitHub Issues — we cooperate with good-faith security and abuse reports.

Users are solely responsible for compliance with local laws and third-party policies.

## API

Local REST API at `http://127.0.0.1:9321` (see Settings for full route list).

```bash
curl http://127.0.0.1:9321/health
curl http://127.0.0.1:9321/profiles
curl -X POST http://127.0.0.1:9321/profiles/{id}/launch
```

When API keys are configured: `Authorization: Bearer cab_...`

## Project structure

```
cloud-antidetect-browser/
├── electron/              # Main process + IPC
├── src/
│   ├── core/
│   │   ├── browser/       # Playwright launcher
│   │   ├── fingerprint/   # Generator, injection, TLS, validation
│   │   ├── proxy/         # Proxy manager + rotation
│   │   ├── sync/          # Google Drive encrypted sync
│   │   ├── webhooks/      # Event webhooks
│   │   └── api/           # REST automation server
│   └── App.tsx            # React UI
├── scripts/               # Build helpers
└── .github/workflows/     # CI release
```

## Contributing

Contributions welcome! Please:

1. Fork the repo
2. Create a feature branch
3. Run `npm run typecheck` before opening a PR
4. Do not commit secrets (`.env`, tokens, profile data)

## Security

See [SECURITY.md](SECURITY.md) for vulnerability reporting.

## License

[MIT](LICENSE) — Copyright (c) 2026 J1BON

## Disclaimer

See **Lawful use & abuse policy** above. This software is provided as-is under the MIT license with no warranty of fitness for any particular purpose.
