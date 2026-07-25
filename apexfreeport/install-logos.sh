#!/bin/bash
set -e
cd ~/apexfreeport
mkdir -p data/uploads
BASE=https://raw.githubusercontent.com/jonnydreamwalker/-jdwapexherp/main/apexfreeport/logos
curl -sL "$BASE/logo_chunk_0.b64" > /tmp/fp.b64
curl -sL "$BASE/logo_chunk_1.b64" >> /tmp/fp.b64
curl -sL "$BASE/logo_chunk_2.b64" >> /tmp/fp.b64
base64 -d /tmp/fp.b64 > data/uploads/apexfreeport-logo.png
curl -sfL "$BASE/favicon.b64" -o /tmp/fp-fav.b64 && base64 -d /tmp/fp-fav.b64 > data/uploads/favicon.png || cp data/uploads/apexfreeport-logo.png data/uploads/favicon.png
cp data/uploads/apexfreeport-logo.png data/uploads/apple-touch-icon.png
ls -la data/uploads/
file data/uploads/apexfreeport-logo.png || true
curl -sI http://127.0.0.1:3000/uploads/apexfreeport-logo.png | head -5
echo DONE
