# BZ Browser — Complete User Guide

Version **0.5.0** · Windows-first · Electron + Playwright antidetect profile manager

---

## Table of contents

1. [Install the app (Windows EXE)](#1-install-the-app-windows-exe)
2. [First launch checklist](#2-first-launch-checklist)
3. [Install patched Chromium (required)](#3-install-patched-chromium-required)
4. [Create and configure a profile](#4-create-and-configure-a-profile)
5. [Proxies](#5-proxies)
6. [Launch, validate, and FP gate](#6-launch-validate-and-fp-gate)
7. [Automation REST API](#7-automation-rest-api)
8. [Google Drive sync (optional)](#8-google-drive-sync-optional)
9. [Cookies, warmup, RPA, extensions](#9-cookies-warmup-rpa-extensions)
10. [Where data is stored](#10-where-data-is-stored)
11. [Build the installer yourself](#11-build-the-installer-yourself)
12. [Troubleshooting](#12-troubleshooting)
13. [Lawful use](#13-lawful-use)

---

## 1. Install the app (Windows EXE)

### Ready-made installer (this build)

After running `npm run pack:win`, the installer is here:

```
C:\Users\MONEY-MACHINE\Projects\cloud-antidetect-browser\release\BZ Browser-Setup-0.5.0.exe
```

Size: ~87 MB (app only; patched Chromium is installed separately — see §3).

### Install steps

1. Double-click **BZ Browser-Setup-0.5.0.exe**.
2. Choose install folder (default is fine).
3. Leave **Create desktop shortcut** enabled.
4. Finish setup and launch from Desktop or Start Menu.

> **Note:** Windows SmartScreen may warn on unsigned builds. Click **More info → Run anyway** for local/dev builds, or sign the EXE for production distribution.

### Uninstall

**Settings → Apps → BZ Browser → Uninstall**  
Profile data under `%APPDATA%` is **kept** by default (NSIS `deleteAppDataOnUninstall: false`).

---

## 2. First launch checklist

Do these once before serious use:

| Step | Action |
|------|--------|
| 1 | Open the app — a default profile may be created automatically |
| 2 | **Settings → Install Patched Chromium** (or use bundled kernel — §3) |
| 3 | Confirm status bar shows **TLS Ready** / patched source |
| 4 | **Settings → Automation** — create at least one **API key** if you use the REST API |
| 5 | Add a **proxy** (Proxies tab) and run **Health check** |
| 6 | Create a real profile, assign proxy, **Launch → Validate** |

---

## 3. Install patched Chromium (required)

Stock Google Chrome **cannot** pass TLS/JA3 antidetect checks. The app **blocks launch** unless patched Chromium is found (unless `ALLOW_STOCK_CHROME=1` for dev).

### Option A — In-app installer (recommended)

1. Open **Settings**.
2. Click **Install Patched Chromium**.
3. Wait for download/extract to `%LOCALAPPDATA%\BZBrowser\chromium\`.
4. Restart the app if TLS status does not update.

The app pins a tested release in `src/core/fingerprint/chromium-manifest.ts`. After install, `chromium-install.json` records the tag for drift warnings.

### Option B — Bundled kernel

The Windows installer includes patched fingerprint-chromium when built with `npm run prepare:chromium`.

### Option C — Manual path

1. Download a **fingerprint-chromium** (or compatible patched) build for Windows x64.
2. Extract so `chrome.exe` exists at:
   ```
   %LOCALAPPDATA%\BZBrowser\chromium\chrome.exe
   ```
3. Or set environment variable before launch:
   ```
   FINGERPRINT_CHROMIUM_PATH=C:\path\to\chrome.exe
   ```

### Verify

In the app header or Settings:

- **Chromium source:** `fingerprint-chromium` (not `chrome`)
- **TLS Ready:** yes
- **Pinned tag** matches manifest (warning if mismatched)

---

## 4. Create and configure a profile

### New profile

1. **Profiles** tab → **New Profile** (or **+**).
2. Each profile gets a unique **fingerprint seed** — one profile = one identity.
3. Optional: pick **group**, **tags**, **color**, **remark**.

### Device fingerprint

- **Regenerate device** — new UA, WebGL, fonts, screen, hardware (keeps profile id).
- **Form factor:** prefer **desktop (Windows/macOS/Linux)** or **mobile (Android)**.
- **Avoid iOS** on Chromium — engine mismatch is detectable; launch is blocked.

### Spoofing defaults (already on for new profiles)

| Vector | Default | Meaning |
|--------|---------|---------|
| Canvas / WebGL / Audio | Noise (`2`) | Seeded perturbation |
| Fonts | Spoof (`2`) | Only listed fonts “exist” |
| WebRTC | Relay (`2`) | ICE scrub + proxy IP rewrite |
| TLS | Spoof (`2`) | Requires patched Chromium |
| Client rects / speech / media | Spoof (`2`) | Consistent synthetic data |

### Meta settings (profile editor)

- **Headless** — off for normal browsing; on for server automation.
- **Launch FP gate** — minimum score before pages open (see §6). `0` = disabled.
- **Min FP score** — default **85** when enabled; measures **internal checks + Sannysoft only**, not CreepJS/Pixelscan.

---

## 5. Proxies

### Add a proxy

1. **Proxies** tab → **Add proxy**.
2. Fill **host**, **port**, **type** (HTTP/SOCKS5), **credentials** if needed.
3. **Health check** — resolves **exit IP** and geo.

### Assign to profile

1. Select profile → **Proxy** section → **Apply saved proxy**.
2. On launch, `prepareProfileForLaunch` aligns **timezone / locale / lat-lon** to proxy exit geo when IP is known.

### Rotation pools

- Set profile **rotation mode** (`session` / `random`) and link **proxy pool IDs**.
- Launch picks a healthy proxy from the pool.

### Geo gate

If proxy exit timezone/country disagrees with profile after alignment, **launch is blocked** with an error. Fix: re-run proxy health check or regenerate profile geo.

---

## 6. Launch, validate, and FP gate

### Launch

1. Select profile → **Launch**.
2. Flow: resolve proxy → geo check → patched Chromium → CDP UA override → inject fingerprint script → optional FP gate → open URLs or blank tab.

### Validate (recommended)

| Button | What it checks |
|--------|----------------|
| **Validate** (quick) | Worker UA parity, native toString masks, canvas paths, DOMRectList, etc. |
| **Validate → External** | Sannysoft, BrowserLeaks, CreepJS, Pixelscan, iphey (slower, real sites) |

Use **External** before trusting a profile on high-risk sites.

### FP gate scope (important)

Launch **Min FP score** = **quick-internal + Sannysoft (~10s)**.  
It does **not** include CreepJS or Pixelscan. For those scores, run **Validate → External** manually.

---

## 7. Automation REST API

Base URL (localhost only):

```
http://127.0.0.1:9321
```

### Setup

1. **Settings → API keys → Create key**.
2. Copy the `cab_...` token (shown once).
3. All requests require:
   ```
   Authorization: Bearer cab_your_token_here
   ```

The server binds **127.0.0.1** only and rejects non-loopback Host/Origin headers.

### Common routes

```bash
# Health (still needs Bearer if keys exist)
curl -H "Authorization: Bearer cab_xxx" http://127.0.0.1:9321/health

# List profiles
curl -H "Authorization: Bearer cab_xxx" http://127.0.0.1:9321/profiles

# Launch profile
curl -X POST -H "Authorization: Bearer cab_xxx" http://127.0.0.1:9321/profiles/{id}/launch

# Quick validate
curl -X POST -H "Authorization: Bearer cab_xxx" "http://127.0.0.1:9321/profiles/{id}/validate?external=1"

# Close
curl -X POST -H "Authorization: Bearer cab_xxx" http://127.0.0.1:9321/profiles/{id}/close
```

See **Settings → Automation** in the UI for the full route list.

### CDP (optional)

CDP debug port is **opt-in** per profile (`enableCdp`). Default off to reduce DevTools detection surface.

---

## 8. Google Drive sync (optional)

1. Google Cloud Console → enable **Drive API** → OAuth Desktop credentials.
2. Copy `.env.example` → `.env` in dev; for packaged app configure via documented env or settings flow.
3. **Settings → Connect Drive** → authorize.
4. **Sync now** encrypts profile bundles (AES-256-GCM + scrypt passphrase) before upload.

Passphrase is chosen by you — loss = data not recoverable.

---

## 9. Cookies, warmup, RPA, extensions

| Feature | How |
|---------|-----|
| **Cookies** | Export/import JSON or Netscape while browser is running |
| **Cookie warmup** | Preset on profile + **Warmup on launch** |
| **RPA** | Record actions in launched browser → save script → replay via UI or API |
| **Extensions** | Add unpacked paths or marketplace IDs; loaded at launch |
| **Webhooks** | Settings → fire events (`profile.launched`, `profile.closed`, etc.) |
| **Extensions** | Extensions tab → store link or manual upload |

---

## 10. Where data is stored

Windows paths:

| Data | Location |
|------|----------|
| App profiles & settings | `%APPDATA%\bz-browser\BZBrowser\` |
| Per-profile browser data | `...\BZBrowser\profiles\{uuid}\browser-data\` |
| Patched Chromium | `%LOCALAPPDATA%\BZBrowser\chromium\` |
| Chromium install record | `...\chromium\chromium-install.json` |
| API keys | `...\BZBrowser\api-keys.json` |

Backup the whole `BZBrowser` folder to migrate machines.

---

## 11. Build the installer yourself

Requirements: **Node.js 20+**, npm, Windows x64 for NSIS.

```powershell
cd C:\Users\MONEY-MACHINE\Projects\cloud-antidetect-browser
npm install
npm run pack:win
```

Output:

```
release\BZ Browser-Setup-0.5.0.exe
release\win-unpacked\          # portable folder (no installer)
```

Scripts:

| Command | Purpose |
|---------|---------|
| `npm run electron:dev` | Dev mode with hot reload |
| `npm run typecheck` | TypeScript check |
| `npm run test:core` | TLS, crypto, canonical FP tests |
| `npm run test:injection` | Injection hook regression gate |
| `scripts\build-win.bat` | Shortcut for `pack:win` |

Optional: `npm run prepare:chromium` bundles patched Chromium into the installer (~large). If download fails, the EXE still builds; users install Chromium via Settings (§3).

---

## 12. Troubleshooting

| Problem | Fix |
|---------|-----|
| **“Patched fingerprint-chromium is required”** | Install patched Chromium (§3); do not rely on stock Chrome |
| **Launch blocked: timezone mismatch** | Proxy health check → auto-align geo; or fix profile timezone |
| **Low external score on CreepJS** | Run External validate; check proxy, Chromium pin, avoid iOS UA |
| **FP gate fails at 85%** | Gate is Sannysoft-only; lower gate or fix worker/UA parity |
| **API 401** | Create API key in Settings; send `Authorization: Bearer` |
| **API 403 Host** | Call only `127.0.0.1:9321`, not LAN IP |
| **WebRTC IP leak** | Use proxy + relay mode (`webRTC: 2`); confirm `proxy.ip` set after health check |
| **Chromium pin warning** | Re-install from Settings when app updates `chromium-manifest.ts` |
| **App crashes on start: `autoUpdater` not found** | Reinstall from latest `release\BZ Browser-Setup-0.5.0.exe` (fixed ESM/CJS import) |
| **SmartScreen blocks EXE** | Unsigned build — Run anyway, or code-sign for distribution |

Logs: run from terminal or check Electron devtools (**View → Toggle Developer Tools** in dev builds).

---

## 13. Lawful use

This tool is for **legitimate** privacy research, authorized QA, and multi-account workflows **where permitted**.

**Do not** use it to evade fraud controls, violate site terms, impersonate others, or break applicable law.

See also [README.md](README.md) — Lawful use & abuse policy.

---

## Quick reference card

```
Install  → release\BZ Browser-Setup-0.5.0.exe
Chromium → Settings → Install Patched Chromium
Proxy    → Proxies → Health check → Assign to profile
Launch   → Profiles → Launch → Validate → External
API      → Settings → API key → http://127.0.0.1:9321
Data     → %APPDATA%\bz-browser\BZBrowser\
```

For development and contributing, see [README.md](README.md) and [SECURITY.md](SECURITY.md).
