#!/bin/bash
set -e
cd ~/apexfreeport
mkdir -p data/uploads
BASE=https://raw.githubusercontent.com/jonnydreamwalker/-jdwapexherp/main/apexfreeport/logos
# Prefer full logo.b64; fall back notes if missing
if curl -sfL "$BASE/logo.b64" -o /tmp/fp-logo.b64; then
  base64 -d /tmp/fp-logo.b64 > data/uploads/apexfreeport-logo.png
fi
if curl -sfL "$BASE/favicon.b64" -o /tmp/fp-fav.b64; then
  base64 -d /tmp/fp-fav.b64 > data/uploads/favicon.png
fi
if curl -sfL "$BASE/apple.b64" -o /tmp/fp-apple.b64; then
  base64 -d /tmp/fp-apple.b64 > data/uploads/apple-touch-icon.png
fi
# If logo exists but favicon missing, reuse logo
if [ -f data/uploads/apexfreeport-logo.png ]; then
  [ -f data/uploads/favicon.png ] || cp data/uploads/apexfreeport-logo.png data/uploads/favicon.png
  [ -f data/uploads/apple-touch-icon.png ] || cp data/uploads/apexfreeport-logo.png data/uploads/apple-touch-icon.png
fi
ls -la data/uploads/
file data/uploads/* 2>/dev/null || true
echo done
