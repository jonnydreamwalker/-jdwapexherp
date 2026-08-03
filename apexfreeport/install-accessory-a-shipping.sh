#!/bin/bash
set -e
cd ~/apexfreeport

curl -fsSL "https://raw.githubusercontent.com/jonnydreamwalker/-jdwapexherp/main/apexfreeport/ship-sku-engine.js" -o ship-sku-engine.js
node --check ship-sku-engine.js

# Point checkout-routes at the SKU engine (idempotent)
node << 'NODE'
const fs = require("fs");
let s = fs.readFileSync("checkout-routes.js", "utf8");
if (s.indexOf('require("./ship-sku-engine")') < 0) {
  s = s.replace(
    'const INVENTORY_FILE = path.join(DATA_DIR, "inventory.json");',
    'const INVENTORY_FILE = path.join(DATA_DIR, "inventory.json");\nlet shipSku = null;\ntry { shipSku = require("./ship-sku-engine"); } catch (e) { console.warn("ship-sku-engine not loaded", e.message); }'
  );
}
if (s.indexOf("shipSku.quoteShipping") < 0) {
  s = s.replace(
    "async function quoteShipping(items, destZip) {",
    'async function quoteShipping(items, destZip) {\n  if (shipSku && typeof shipSku.quoteShipping === "function") {\n    return shipSku.quoteShipping(items, destZip);\n  }\n  // fallback inline engine below'
  );
}
fs.writeFileSync("checkout-routes.js", s);
console.log("checkout delegates to ship-sku-engine:", s.indexOf("shipSku.quoteShipping") >= 0);
NODE

node --check checkout-routes.js

node -e '
const s=require("./ship-sku-engine");
(async()=>{
  const a=await s.quoteShipping([{sku:"XX-001-UNS-001-YY-A",price:5,quantity:1}],"32433");
  const b=await s.quoteShipping([{sku:"XX-001-UNS-001-YY-A",price:5,quantity:35}],"32433");
  const c=await s.quoteShipping([{sku:"XX-001-UNS-001-YY-A",price:5,quantity:36}],"32433");
  console.log("1x-A", a.amount, "| 35x-A", b.amount, "| 36x-A", c.amount);
  console.log("fields", "accessoryAShipping=", a.accessoryAShipping, "qty=", a.accessoryAQty);
})();
'

pkill -f "node server.js" 2>/dev/null || true
sleep 1
set -a; source /etc/apexfreeport.env; set +a
nohup node server.js >> /tmp/apexfreeport.log 2>&1 &
sleep 2
curl -s http://127.0.0.1:3000/health; echo
echo "DONE -A shipping live"
