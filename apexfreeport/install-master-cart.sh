#!/bin/bash
# Install ApexFreePort master cross-store cart on EC2
set -e
ROOT="${1:-$HOME/apexfreeport}"
cd "$ROOT"

echo "== Master cart install =="

cp -a cart-routes.js cart-routes.js.bak 2>/dev/null || true
cp -a server.js server.js.bak-cart 2>/dev/null || true

curl -fsSL "https://raw.githubusercontent.com/jonnydreamwalker/-jdwapexherp/main/apexfreeport/cart-routes.js" -o cart-routes.js

python3 << 'PY'
from pathlib import Path
p = Path("server.js")
t = p.read_text()
if "cart-routes" in t:
    print("server.js already mounts cart-routes")
else:
    needle = '''try {
  require("./checkout-routes")(app);
  console.log("Checkout routes: mounted");
} catch (e) {
  console.error("Checkout routes failed:", e.message);
}'''
    insert = '''try {
  require("./cart-routes")(app);
  console.log("Cart routes: mounted");
} catch (e) {
  console.error("Cart routes failed:", e.message);
}

try {
  require("./checkout-routes")(app);
  console.log("Checkout routes: mounted");
} catch (e) {
  console.error("Checkout routes failed:", e.message);
}'''
    if needle not in t:
        raise SystemExit("checkout mount block not found — stop")
    t = t.replace(needle, insert, 1)
    p.write_text(t)
    print("server.js: cart-routes mounted")

t = p.read_text()
old = 'res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");'
new = 'res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");'
if old in t:
    p.write_text(t.replace(old, new, 1))
    print("CORS methods widened")
elif "PUT,PATCH,DELETE" in t:
    print("CORS already wide")
else:
    print("CORS line not found (cart-routes sets methods too)")
PY

mkdir -p data
if [ ! -f data/carts.json ]; then
  echo '{"updated":"","carts":{}}' > data/carts.json
  echo "data/carts.json created"
fi

node --check cart-routes.js
node --check server.js

if systemctl is-enabled apexfreeport.service >/dev/null 2>&1; then
  sudo systemctl restart apexfreeport.service
  sleep 2
  systemctl is-active apexfreeport.service
else
  pkill -f "node server.js" 2>/dev/null || true
  sleep 1
  set -a
  source /etc/apexfreeport.env 2>/dev/null || true
  set +a
  nohup node server.js >> /tmp/apexfreeport.log 2>&1 &
  sleep 2
fi

curl -s http://127.0.0.1:3000/health; echo
CID=$(curl -s -X POST http://127.0.0.1:3000/api/cart -H 'Content-Type: application/json' -d '{}' | python3 -c "import sys,json;print(json.load(sys.stdin).get('id',''))")
echo "cart id: $CID"
curl -s -X POST "http://127.0.0.1:3000/api/cart/$CID/items" \
  -H 'Content-Type: application/json' \
  -d '{"sku":"TEST-SKU","name":"Test","price":9.99,"quantity":1,"store":"herp"}'
echo
curl -s "http://127.0.0.1:3000/api/cart/$CID"; echo
echo "DONE master-cart"
