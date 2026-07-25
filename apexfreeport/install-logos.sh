#!/bin/bash
set -e
cd ~/apexfreeport
mkdir -p data/uploads
BASE=https://raw.githubusercontent.com/jonnydreamwalker/-jdwapexherp/main/apexfreeport/logos
> /tmp/fp.b64
for i in 0 1 2; do
  curl -sfL "$BASE/logo_chunk_${i}.b64" >> /tmp/fp.b64 || { echo "missing chunk $i"; exit 1; }
done
base64 -d /tmp/fp.b64 > data/uploads/apexfreeport-logo.png
if curl -sfL "$BASE/favicon.b64" -o /tmp/fp-fav.b64; then
  base64 -d /tmp/fp-fav.b64 > data/uploads/favicon.png
else
  cp data/uploads/apexfreeport-logo.png data/uploads/favicon.png
fi
if curl -sfL "$BASE/apple.b64" -o /tmp/fp-apple.b64; then
  base64 -d /tmp/fp-apple.b64 > data/uploads/apple-touch-icon.png
else
  cp data/uploads/apexfreeport-logo.png data/uploads/apple-touch-icon.png
fi
ls -la data/uploads/
file data/uploads/*.png 2>/dev/null || true
curl -sI http://127.0.0.1:3000/uploads/apexfreeport-logo.png | head -5
echo DONE
