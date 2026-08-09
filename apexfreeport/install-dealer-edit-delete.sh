#!/bin/bash
# ApexFreePort — dealer Edit + Delete on admin dealers list
set -e
cd ~/apexfreeport
cp -a wholesale-routes.js wholesale-routes.js.bak-dealer-crud 2>/dev/null || true
cp -a admin/dealers.html admin/dealers.html.bak-dealer-crud 2>/dev/null || true

curl -fsSL "https://raw.githubusercontent.com/jonnydreamwalker/-jdwapexherp/main/apexfreeport/wholesale-routes.js" -o wholesale-routes.js
curl -fsSL "https://raw.githubusercontent.com/jonnydreamwalker/-jdwapexherp/main/apexfreeport/admin/dealers.html" -o admin/dealers.html

node --check wholesale-routes.js
grep -n 'dealers/:id' wholesale-routes.js | head
grep -n 'dealer-del\|editDealerModal' admin/dealers.html | head

pkill -f "node server.js" 2>/dev/null || true
sleep 1
set -a; source /etc/apexfreeport.env; set +a
nohup node server.js >> /tmp/apexfreeport.log 2>&1 &
sleep 2
curl -s http://127.0.0.1:3000/health; echo
echo "DONE dealer-edit-delete"
