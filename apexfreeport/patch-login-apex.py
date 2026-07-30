#!/usr/bin/env python3
"""Accept username Apex (and admin). Password stays ADMIN_PASSWORD env."""
from pathlib import Path
import re

p = Path("server.js")
t = p.read_text()

t = t.replace(
    'const ADMIN_USER = process.env.ADMIN_USER || "admin";',
    'const ADMIN_USER = process.env.ADMIN_USER || "Apex";',
)

new_login = '''app.post("/login", function (req, res) {
  const user = String((req.body && req.body.username) || "").trim();
  const pass = (req.body && req.body.password) || "";
  const u = user.toLowerCase();
  const allowed = [String(ADMIN_USER || "Apex").toLowerCase(), "apex", "admin", ""];
  const userOk = allowed.indexOf(u) >= 0;
  if (userOk && pass === PASS) {
    req.session.ok = true;
    req.session.user = user || ADMIN_USER;
    if (req.body && (req.body.remember === "1" || req.body.remember === "on")) {
      req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;
    }
    return res.redirect("/admin");
  }
  return res.redirect("/login?err=1");
});'''

t2, n = re.subn(
    r'app\.post\("/login", function \(req, res\) \{[\s\S]*?return res\.redirect\("/login\?err=1"\);\n\}\);',
    new_login,
    t,
    count=1,
)
if n:
    t = t2
    print("login handler patched")
else:
    print("login handler pattern miss — check server.js")

p.write_text(t)
print("DONE — username Apex + existing ADMIN_PASSWORD")
