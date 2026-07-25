#!/bin/bash
set -e
cd ~/apexfreeport
mkdir -p data/uploads
BASE=https://raw.githubusercontent.com/jonnydreamwalker/-jdwapexherp/main/apexfreeport/logos
curl -sL "$BASE/logo.b64" | base64 -d > data/uploads/apexfreeport-logo.png
curl -sL "$BASE/favicon.b64" | base64 -d > data/uploads/favicon.png
curl -sL "$BASE/apple.b64" | base64 -d > data/uploads/apple-touch-icon.png
ls -la data/uploads/
echo done
