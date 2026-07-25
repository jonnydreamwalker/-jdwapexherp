#!/bin/bash
set -e
cd ~/apexfreeport
mkdir -p data/uploads
BASE=https://raw.githubusercontent.com/jonnydreamwalker/-jdwapexherp/main/apexfreeport
# SVG logo
curl -sfL "$BASE/data/uploads/apexfreeport-logo.svg" -o data/uploads/apexfreeport-logo.svg
# Also save as .png name won't work for SVG content — keep svg
# Favicon from b64 if present
if curl -sfL "$BASE/logos/favicon.b64" -o /tmp/fp-fav.b64; then
  base64 -d /tmp/fp-fav.b64 > data/uploads/favicon.png
fi
if curl -sfL "$BASE/logos/apple.b64" -o /tmp/fp-apple.b64; then
  base64 -d /tmp/fp-apple.b64 > data/uploads/apple-touch-icon.png
fi
# If no png logo, use svg path in admin (already updated)
ls -la data/uploads/
echo DONE
