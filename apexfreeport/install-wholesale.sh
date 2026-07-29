#!/bin/bash
# Run on EC2 inside ~/apexfreeport after pulling from GitHub
set -e
cd ~/apexfreeport
mkdir -p data admin

if [ -f wholesale-routes.js ]; then
  echo "wholesale-routes.js present"
else
  echo "WARN: wholesale-routes.js missing — pull from GitHub"
fi

[ -f data/applications.json ] || echo '{"applications":[]}' > data/applications.json
[ -f data/dealers.json ] || echo '{"dealers":[]}' > data/dealers.json

python3 << 'PY'
from pathlib import Path
p = Path("server.js")
t = p.read_text()
if 'require("./wholesale-routes")' in t:
    print("wholesale-routes already wired")
else:
    needle = "app.listen("
    idx = t.find(needle)
    if idx < 0:
        print("FAIL: app.listen not found")
    else:
        block = (
            "try {\n"
            '  require("./wholesale-routes")(app, {\n'
            "    auth: auth,\n"
            '    dataDir: path.join(__dirname, "data"),\n'
            "    readInventory: typeof read === \"function\" ? read : undefined,\n"
            "    writeInventory: typeof write === \"function\" ? write : undefined\n"
            "  });\n"
            '  console.log("Wholesale: registered");\n'
            "} catch (e) {\n"
            '  console.error("Wholesale routes failed", e.message);\n'
            "}\n\n"
        )
        t = t[:idx] + block + t[idx:]
        p.write_text(t)
        print("wired wholesale-routes into server.js")
PY

node --check server.js && echo SYNTAX_OK
sudo systemctl restart apexfreeport
sleep 2
curl -s http://127.0.0.1:3000/health
echo
echo "Done. Admin dealers UI: /admin/dealers"
