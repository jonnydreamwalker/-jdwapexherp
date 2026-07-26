from pathlib import Path
p = Path("server.js")
t = p.read_text()
if "/admin/favicon-force.js" in t:
    print("route already present")
else:
    needle = (
        'app.get("/favicon.svg", function (req, res) {\n'
        '  res.setHeader("Cache-Control", "no-cache, max-age=0");\n'
        '  res.type("image/svg+xml").send(FREEPORT_FAVICON_SVG);\n'
        '});'
    )
    add = needle + (
        '\n\napp.get("/admin/favicon-force.js", function (req, res) {\n'
        '  res.setHeader("Cache-Control", "no-cache, max-age=0");\n'
        '  res.type("application/javascript");\n'
        '  res.sendFile(path.join(__dirname, "admin", "favicon-force.js"));\n'
        '});'
    )
    if needle not in t:
        print("FAIL: favicon.svg route not found")
    else:
        p.write_text(t.replace(needle, add, 1))
        print("route injected")
