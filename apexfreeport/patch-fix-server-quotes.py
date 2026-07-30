#!/usr/bin/env python3
"""Fix broken escaped quotes from wholesale patch + restore isPublicListed."""
from pathlib import Path
import re
import json

p = Path("server.js")
t = p.read_text()

before = t.count('\\"')
t = t.replace('\\"', '"')
print("unescaped quote pairs:", before)

new_fn = (
    "function isPublicListed(i) {\n"
    "  if (!i) return false;\n"
    '  if ((i.status || "active") === "archived") return false;\n'
    '  if (i.listed === false || i.listed === "false") return false;\n'
    "  if (i.hidden === true || i.hideFromSales === true) return false;\n"
    '  var pool = String(i.pool || i.channel || "").toLowerCase();\n'
    '  if (pool === "wholesale" || pool === "dealer") return false;\n'
    '  if (i.dealerEligible === true || i.dealerEligible === "true" || i.dealerEligible === 1) return false;\n'
    "  var w = Number(i.weightLb) || 0;\n"
    '  if (w >= 50 && pool !== "both") return false;\n'
    '  if (pool && pool !== "retail" && pool !== "both" && pool !== "") return false;\n'
    "  return true;\n"
    "}"
)

t2, n = re.subn(r"function isPublicListed\(i\) \{[\s\S]*?\n\}", new_fn, t, count=1)
if n:
    t = t2
    print("isPublicListed restored")
else:
    print("WARN: isPublicListed block not found (quotes still fixed)")

p.write_text(t)

inv = Path("data/inventory.json")
if inv.exists():
    d = json.loads(inv.read_text())
    changed = 0

    def fix(it):
        global changed
        if not isinstance(it, dict):
            return
        pool = str(it.get("pool") or it.get("channel") or "").lower()
        try:
            w = float(it.get("weightLb") or 0)
        except (TypeError, ValueError):
            w = 0
        de = it.get("dealerEligible") in (True, "true", 1)
        if pool in ("wholesale", "dealer") or de or (w >= 50 and pool != "both"):
            it["pool"] = "wholesale"
            it["channel"] = "wholesale"
            it["dealerEligible"] = True
            it["listed"] = False
            it["hideFromSales"] = True
            changed += 1

    if "stores" in d:
        for st in (d.get("stores") or {}).values():
            if isinstance(st, dict):
                for it in st.get("items") or []:
                    fix(it)
    for it in d.get("items") or []:
        fix(it)
    if changed:
        inv.write_text(json.dumps(d, indent=2))
        print("inventory fixed", changed)
    else:
        print("inventory ok")

print("DONE")
