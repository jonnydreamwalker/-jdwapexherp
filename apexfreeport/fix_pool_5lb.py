#!/usr/bin/env python3
"""Force retail for under-50lb SKUs; stop auto-wholesale on any weight+price."""
import json, re
from pathlib import Path

base = Path("/home/ec2-user/apexfreeport")

# 1) Fix inventory: anything under 50 lb is retail / sales
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

# 2) Patch admin app.js
app = base / "admin" / "app.js"
t = app.read_text()
bad = """    } else if (dealerPrice != null && dealerPrice > 0 && weightLb != null && weightLb > 0) {
      body.pool = body.listed ? \"both\" : \"wholesale\";
      body.dealerEligible = true;
    } else {"""
good = """    } else {"""
if bad in t:
    t = t.replace(bad, good, 1)
    print("app.js: removed auto-wholesale on any weight")
else:
    print("app.js: bad branch already gone or different")

new_pool = '''function itemPool(it) {
    if (!it) return "retail";
    var p = String(it.pool || it.channel || "").toLowerCase();
    if (p === "retail") return "retail";
    if (p === "wholesale" || p === "dealer") return "wholesale";
    if (p === "both" || p === "all") return "both";
    var w = Number(it.weightLb) || 0;
    if (w >= 50) return "wholesale";
    var n = String(it.name || "").toLowerCase();
    var m = n.match(/(\\d+)\\s*lb/);
    if (m && Number(m[1]) >= 50) return "wholesale";
    return "retail";
  }'''
t2, n = re.subn(r"function itemPool\(it\) \{.*?\n  \}", new_pool, t, count=1, flags=re.S)
if n:
    t = t2
    print("app.js: itemPool updated")
else:
    print("app.js: itemPool pattern not matched")
app.write_text(t)

# 3) Patch server isPublicListed
srv = base / "server.js"
st = srv.read_text()
new_pub = '''function isPublicListed(i) {
  if (!i) return false;
  if ((i.status || "active") === "archived") return false;
  if (i.listed === false || i.listed === "false") return false;
  if (i.hidden === true || i.hideFromSales === true) return false;
  var pool = String(i.pool || i.channel || "").toLowerCase();
  if (pool === "retail" || pool === "both") return true;
  if (pool === "wholesale" || pool === "dealer") return false;
  var w = Number(i.weightLb) || 0;
  if (w >= 50) return false;
  var n = String(i.name || "").toLowerCase();
  var m = n.match(/(\\d+)\\s*lb/);
  if (m && Number(m[1]) >= 50) return false;
  return true;
}'''
st2, n = re.subn(r"function isPublicListed\(i\) \{.*?\n\}", new_pub, st, count=1, flags=re.S)
if n:
    srv.write_text(st2)
    print("server.js: isPublicListed updated")
else:
    print("server.js: isPublicListed pattern not matched")

print("DONE — run: sudo systemctl restart apexfreeport")
