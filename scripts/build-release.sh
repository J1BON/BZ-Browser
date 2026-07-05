#!/usr/bin/env bash
set -euo pipefail
echo "Building Cloud Antidetect Browser..."
npm run build
npx electron-builder --publish never "$@"
echo "Done! Artifacts in release/"
