#!/bin/bash
cd /home/ec2-user/apexfreeport
python3 -c '
from pathlib import Path
p = Path("server.js")
t = p.read_text()
if "req.rawBody" in t:
    print("rawBody already present")
else:
    old = "app.use(express.json({ limit: \"25mb\" }));"
    new = """app.use(express.json({
  limit: \"25mb\",
  verify: function (req, res, buf) {
    if (req.originalUrl && req.originalUrl.indexOf(\"/api/webhook/\") === 0) {
      req.rawBody = buf;
    }
  }
}));"""
    if old not in t:
        print("MARKER_NOT_FOUND")
    else:
        p.write_text(t.replace(old, new, 1))
        print("patched")
'
node --check server.js
sudo systemctl restart apexfreeport
sleep 2
curl -s http://127.0.0.1:3000/api/checkout/status
echo
