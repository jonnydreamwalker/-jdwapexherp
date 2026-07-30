#!/bin/bash
set -e
cd /home/ec2-user/apexfreeport
A0=$(curl -sL https://raw.githubusercontent.com/jonnydreamwalker/-jdwapexherp/main/apexfreeport/checkout-routes.js.b64.a0)
A1=$(curl -sL https://raw.githubusercontent.com/jonnydreamwalker/-jdwapexherp/main/apexfreeport/checkout-routes.js.b64.a1)
echo "${A0}${A1}" | base64 -d | gunzip > checkout-routes.js
node --check checkout-routes.js
echo checkout-routes.js OK
curl -sL https://raw.githubusercontent.com/jonnydreamwalker/-jdwapexherp/main/apexfreeport/patch-server-rawbody.sh | bash
echo ALL_DONE
