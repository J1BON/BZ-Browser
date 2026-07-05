# Security Policy

## Supported versions

| Version | Supported |
| ------- | --------- |
| 0.5.x   | Yes       |
| < 0.5   | No        |

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security bugs.

Email **jibanahammed8@gmail.com** with:

- Description of the issue
- Steps to reproduce
- Impact assessment (if known)

We aim to respond within 7 days.

## Sensitive data

Never commit:

- `.env` (Google OAuth credentials)
- `google-token.json` / user sync tokens
- Profile browser data or proxy credentials
- API keys (`cab_...`) or webhook secrets

These stay in local app data (`%APPDATA%/CloudAntidetect/` on Windows).
