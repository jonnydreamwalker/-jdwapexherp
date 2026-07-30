#!/usr/bin/env python3
"""Make DON'T TOUCH a master switch: public site + wholesale OFF together."""
from pathlib import Path
import re

p = Path("server.js")
t = p.read_text()

if "function getMasterOnline" not in t:
    t = t.replace(
        "function read() {",
        """function getMasterOnline(d) {
  d = d || read();
  if (typeof d.masterOnline === \"boolean\") return d.masterOnline;
  if (d.stores) {
    return !!(d.stores.herp && d.stores.herp.publicFeed) ||
      !!(d.stores.k9 && d.stores.k9.publicFeed) ||
      !!(d.stores.feline && d.stores.feline.publicFeed);
  }
  return !!d.publicFeed;
}
function setMasterOnline(enabled) {
  var d = read();
  d.masterOnline = !!enabled;
  if (!enabled && d.stores) {
    Object.keys(d.stores).forEach(function (k) {
      if (d.stores[k]) d.stores[k].publicFeed = false;
    });
  }
  if (enabled && d.stores && d.stores.herp) d.stores.herp.publicFeed = true;
  d.publicFeed = !!enabled;
  write(d);
  return d;
}
function read() {""",
        1,
    )
    print("helpers ok")

m = re.search(
    r'app\.post\("/api/admin/public-feed", auth, function \(req, res\) \{[\s\S]*?\n\}\);',
    t,
)
if m and "setMasterOnline" not in m.group(0):
    t = t.replace(
        m.group(0),
        """app.post("/api/admin/public-feed", auth, function (req, res) {
  const enabled = !!(req.body && req.body.enabled);
  const d = setMasterOnline(enabled);
  res.json({
    ok: true,
    masterOnline: getMasterOnline(d),
    publicFeed: getMasterOnline(d),
    message: enabled
      ? "SITE LIVE — public + wholesale feeds ON"
      : "SITE OFFLINE — public + wholesale feeds OFF (maintenance)"
  });
});""",
        1,
    )
    print("public-feed -> master")
elif m and "setMasterOnline" in m.group(0):
    print("public-feed already master")
else:
    print("public-feed miss")

if "Site offline for maintenance. Master switch is OFF." not in t:
    t = t.replace(
        "if (!st.publicFeed) {",
        """if (!getMasterOnline(d)) {
      return res.status(503).json({
        error: \"maintenance\",
        message: \"Site offline for maintenance. Master switch is OFF.\",
        masterOnline: false,
        publicFeed: false,
        items: []
      });
    }
    if (!st.publicFeed) {""",
        1,
    )
    print("products gate ok")

p.write_text(t)

w = Path("wholesale-routes.js")
if w.exists():
    wt = w.read_text()
    if "master switch OFF" not in wt and "FreePort master switch OFF" not in wt:
        if "const inv = loadInventory();" in wt:
            wt = wt.replace(
                "const inv = loadInventory();",
                """const inv = loadInventory();
      var rawInv = null;
      try { rawInv = typeof opts.readInventory === \"function\" ? opts.readInventory() : null; } catch (e) {}
      var masterOn = true;
      if (rawInv && typeof rawInv.masterOnline === \"boolean\") masterOn = rawInv.masterOnline;
      if (!masterOn) {
        return res.status(503).json({
          error: \"maintenance\",
          message: \"Wholesale offline — FreePort master switch OFF.\",
          masterOnline: false,
          items: []
        });
      }""",
                1,
            )
            w.write_text(wt)
            print("wholesale gated")
    else:
        print("wholesale already gated")

a = Path("admin/app.js")
if a.exists():
    at = a.read_text()
    at = at.replace(
        '$("btnFeed").textContent = "DON\'T TOUCH · Public feed " + (publicFeed ? "ON" : "OFF");',
        '$("btnFeed").textContent = "DON\'T TOUCH · SITE " + (publicFeed ? "LIVE" : "OFFLINE");',
    )
    old_click = 'api("/api/admin/public-feed", { method: "POST", body: { store: store, enabled: next } })'
    new_click = 'api("/api/admin/public-feed", { method: "POST", body: { enabled: next } })'
    if old_click in at:
        at = at.replace(old_click, new_click)
        print("admin api body ok")
    at = at.replace("Go LIVE?", "Go LIVE — whole site?")
    at = at.replace("Turn feed OFF?", "MAINTENANCE — shut everything down?")
    at = at.replace(
        "jdwapexherp.com will go LIVE with this store's inventory.",
        "Turns ON the public website inventory AND the wholesale dealer portal.",
    )
    at = at.replace(
        "Shut public feed for this store?",
        "MASTER SWITCH OFF. Public site + wholesale portal both offline.",
    )
    a.write_text(at)
    print("admin UI ok")

print("DONE — red button is master switch")
