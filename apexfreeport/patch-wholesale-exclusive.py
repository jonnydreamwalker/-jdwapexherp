#!/usr/bin/env python3
"""Wholesale checkbox = wholesale ONLY — never on main sales /api/products."""
from pathlib import Path
import re
import json

p = Path("server.js")
t = p.read_text()

new_fn = r"""function isPublicListed(i) {
  if (!i) return false;
  if ((i.status || \"active\") === \"archived\") return false;
  if (i.listed === false || i.listed === \"false\") return false;
  if (i.hidden === true || i.hideFromSales === true) return false;
  var pool = String(i.pool || i.channel || \"\").toLowerCase();
  if (pool === \"wholesale\" || pool === \"dealer\") return false;
  if (i.dealerEligible === true || i.dealerEligible === \"true\" || i.dealerEligible === 1) return false;
  var w = Number(i.weightLb) || 0;
  if (w >= 50 && pool !== \"both\") return false;
  if (pool && pool !== \"retail\" && pool !== \"both\" && pool !== \"\") return false;
  return true;
}"""

t2, n = re.subn(r"function isPublicListed\(i\) \{[\s\S]*?\n\}", new_fn, t, count=1)
if n:
    t = t2
    print("isPublicListed patched")
elif "function isPublicListed" not in t:
    if "function publicItem" in t:
        t = t.replace("function publicItem", new_fn + "\n\nfunction publicItem", 1)
        print("isPublicListed inserted")
    else:
        print("WARN: no insert point for isPublicListed")
else:
    print("isPublicListed present but regex miss")

if ".filter(isPublicListed)" not in t:
    replacements = [
        (
            'items = (st.items || []).filter(function (i) { return (i.status || "active") !== "archived"; })',
            "items = (st.items || []).filter(isPublicListed)",
        ),
        (
            '(st.items || []).filter(function (i) { return (i.status || "active") !== "archived"; }).map(publicItem)',
            "(st.items || []).filter(isPublicListed).map(publicItem)",
        ),
    ]
    for old, new in replacements:
        if old in t:
            t = t.replace(old, new)
            print("products filter hooked")
            break
    else:
        print("WARN: could not hook /api/products filter")

p.write_text(t)

inv = Path("data/inventory.json")
if inv.exists():
    d = json.loads(inv.read_text())
    changed = 0

    def fix_item(it):
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
                    fix_item(it)
    for it in d.get("items") or []:
        fix_item(it)
    if changed:
        inv.write_text(json.dumps(d, indent=2))
        print("inventory fixed", changed, "wholesale-only SKUs")
    else:
        print("inventory: no wholesale flags to fix (or already exclusive)")
else:
    print("no data/inventory.json yet")

print("DONE — wholesale never on sales pages")
