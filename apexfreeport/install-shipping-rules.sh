#!/bin/bash
set -e
cd ~/apexfreeport
curl -sL https://raw.githubusercontent.com/jonnydreamwalker/-jdwapexherp/main/apexfreeport/cr.b64.p0 -o /tmp/cr.p0
curl -sL https://raw.githubusercontent.com/jonnydreamwalker/-jdwapexherp/main/apexfreeport/cr.b64.p1 -o /tmp/cr.p1
python3 -c "import pathlib,base64; b=pathlib.Path('/tmp/cr.p0').read_text()+pathlib.Path('/tmp/cr.p1').read_text(); pathlib.Path('checkout-routes.js').write_bytes(base64.b64decode(b)); print('ok', len(base64.b64decode(b)))"
node --check checkout-routes.js
sudo systemctl restart apexfreeport
sleep 2
curl -s http://127.0.0.1:3000/api/checkout/status; echo
curl -s -X POST http://127.0.0.1:3000/api/checkout/shipping-quote -H 'Content-Type: application/json' -d '{\"items\":[{\"name\":\"UFO Cork Flats\",\"sku\":\"HS-UFO-FLAT-01\",\"price\":24.99,\"quantity\":1}]}'; echo
