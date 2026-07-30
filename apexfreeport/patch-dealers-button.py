#!/usr/bin/env python3
"""Inject a huge Dealers button on FreePort admin + ensure /admin/dealers route."""
from pathlib import Path

idx = Path("admin/index.html")
h = idx.read_text()

BIG = (
    '<a href="/admin/dealers" id="btnDealersBig" '
    'style="display:block;width:100%;max-width:420px;text-align:center;'
    "padding:14px 16px;margin:0 0 14px;background:#065f46;color:#6ee7b7;"
    "border:2px solid #34d399;border-radius:12px;font-weight:900;font-size:15px;"
    "text-transform:uppercase;letter-spacing:.06em;text-decoration:none;"
    'box-shadow:0 0 24px rgba(52,211,153,.25)">' 
    "DEALERS - APPROVE / DENY</a>\n"
)

if 'id="btnDealersBig"' not in h:
    if 'id="btnFeed"' in h and "</button>" in h:
        marker = 'id="btnFeed"'
        i = h.find(marker)
        j = h.find("</button>", i)
        if j > 0:
            h = h[: j + len("</button>")] + "\n  " + BIG + h[j + len("</button>") :]
            print("big button after feed")
        else:
            print("feed button end not found")
    elif 'id="btnAdd"' in h:
        h = h.replace(
            '<button type="button" id="btnAdd">',
            BIG + '    <button type="button" id="btnAdd">',
            1,
        )
        print("button before add")
    else:
        print("WARN: could not place big button")

    if 'href="/admin/dealers"' not in h and 'href="/admin/fulfillment"' in h:
        h = h.replace(
            '<a href="/admin/fulfillment">',
            '<a href="/admin/dealers" style="color:#34d399;font-weight:900">Dealers</a>\n'
            '      <a href="/admin/fulfillment">',
            1,
        )
        print("header link added")

    idx.write_text(h)
    print("index written")
else:
    print("big button already present")

s = Path("server.js")
t = s.read_text()
if 'app.get("/admin/dealers"' not in t:
    i = t.rfind("app.listen")
    block = (
        "\napp.get(\"/admin/dealers\", auth, function (req, res) {\n"
        '  var f = path.join(__dirname, "admin", "dealers.html");\n'
        "  if (require(\"fs\").existsSync(f)) return res.sendFile(f);\n"
        '  res.status(404).type("html").send("<h1>Dealers page missing</h1>'
        '<p>Pull admin/dealers.html</p>");\n'
        "});\n\n"
    )
    t = t[:i] + block + t[i:]
    s.write_text(t)
    print("server /admin/dealers route added")
else:
    print("server dealers route exists")

print("DONE")
