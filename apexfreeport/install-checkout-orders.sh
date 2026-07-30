#!/bin/bash
set -e
cd /home/ec2-user/apexfreeport
curl -sL https://raw.githubusercontent.com/jonnydreamwalker/-jdwapexherp/main/apexfreeport/checkout-routes.js.b64 -o /tmp/cr.b64
base64 -d /tmp/cr.b64 | gunzip > checkout-routes.js
node --check checkout-routes.js
curl -sL https://raw.githubusercontent.com/jonnydreamwalker/-jdwapexherp/main/apexfreeport/patch-server-rawbody.sh | bash
echo ALL_DONE
