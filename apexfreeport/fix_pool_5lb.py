#!/usr/bin/env python3
"""Force retail for under-50lb SKUs; stop auto-wholesale on small weights."""
import json, re
from pathlib import Path

base = Path("/home/ec2-user/apexfreeport")

# 1) Inventory: under 50 lb -> retail
inv_path = base / "data" / "inventory.json"
data = json.loads(inv_path.read_text())

def all_items(d):
    if isinstance(d.get("items"), list):
        return d["items"]
    out = []
    for st in (d.get("stores") or {}).values():
        if isinstance(st, dict) and isinstance(st.get("items"), list):
            out.extend(st["items"])
    return out

fixed = 0
for it in all_items(data):
    try:
        w = float(it.get("weightLb") or 0)
    except Exception:
        w = 0
    name = str(it.get("name") or "").lower()
    m = re.search(r"(\d+)\s*lb", name)
    name_lb = float(m.group(1)) if m else 0
    bulk = w >= 50 or name_lb >= 50
    pool = str(it.get("pool") or it.get("channel") or "").lower()
    if not bulk:
        if pool in ("wholesale", "dealer", "both") or it.get("dealerEligible"):
            it["pool"] = "retail"
            it["channel"] = "retail"
            it["dealerEligible"] = False
            if it.get("listed") is False:
                it["listed"] = True
            fixed += 1
            print("RETAIL", it.get("sku"), it.get("name"), "weight", w or name_lb or "?")

inv_path.write_text(json.dumps(data, indent=2))
print("inventory fixed rows:", fixed)

# 2) app.js — remove auto-wholesale branch + replace itemPool by string markers
app = base / "admin" / "app.js"
t = app.read_text()

bad = (
    '    } else if (dealerPrice != null && dealerPrice > 0 && weightLb != null && weightLb > 0) {\n'
    '      body.pool = body.listed ? "both" : "wholesale";\n'
    '      body.dealerEligible = true;\n'
    '    } else {'
)
if bad in t:
    t = t.replace(bad, "    } else {", 1)
    print("app.js: removed auto-wholesale on any weight")
else:
    print("app.js: bad branch already gone or different")

start = t.find("function itemPool(it) {")
if start >= 0:
    # find matching closing brace at function indent level (next "  function " or end of sibling)
    i = start + len("function itemPool(it) {")
    depth = 1
    while i < len(t) and depth:
        if t[i] == "{":
            depth += 1
        elif t[i] == "}":
            depth -= 1
        i += 1
    new_pool = (
        "function itemPool(it) {\n"
        "    if (!it) return \"retail\";\n"
        "    var p = String(it.pool || it.channel || \"\").toLowerCase();\n"
        "    if (p === \"retail\") return \"retail\";\n"
        "    if (p === \"wholesale\" || p === \"dealer\") return \"wholesale\";\n"
        "    if (p === \"both\" || p === \"all\") return \"both\";\n"
        "    var w = Number(it.weightLb) || 0;\n"
        "    if (w >= 50) return \"wholesale\";\n"
        "    var n = String(it.name || \"\").toLowerCase();\n"
        "    var m = n.match(/(\\d+)\\s*lb/);\n"
        "    if (m && Number(m[1]) >= 50) return \"wholesale\";\n"
        "    return \"retail\";\n"
        "  }"
    )
    t = t[:start] + new_pool + t[i:]
    print("app.js: itemPool updated")
else:
    print("app.js: itemPool not found")

app.write_text(t)

# 3) server.js isPublicListed
srv = base / "server.js"
st = srv.read_text()
start = st.find("function isPublicListed(i) {")
if start >= 0:
    i = start + len("function isPublicListed(i) {")
    depth = 1
    while i < len(st) and depth:
        if st[i] == "{":
            depth += 1
        elif st[i] == "}":
            depth -= 1
        i += 1
    new_pub = (
        "function isPublicListed(i) {\n"
        "  if (!i) return false;\n"
        "  if ((i.status || \"active\") === \"archived\") return false;\n"
        "  if (i.listed === false || i.listed === \"false\") return false;\n"
        "  if (i.hidden === true || i.hideFromSales === true) return false;\n"
        "  var pool = String(i.pool || i.channel || \"\").toLowerCase();\n"
        "  if (pool === \"retail\" || pool === \"both\") return true;\n"
        "  if (pool === \"wholesale\" || pool === \"dealer\") return false;\n"
        "  var w = Number(i.weightLb) || 0;\n"
        "  if (w >= 50) return false;\n"
        "  var n = String(i.name || \"\").toLowerCase();\n"
        "  var m = n.match(/(\\d+)\\s*lb/);\n"
        "  if (m && Number(m[1]) >= 50) return false;\n"
        "  return true;\n"
        "}"
    )
    st = st[:start] + new_pub + st[i:]
    srv.write_text(st)
    print("server.js: isPublicListed updated")
else:
    print("server.js: isPublicListed not found")

print("DONE — run: sudo systemctl restart apexfreeport")
