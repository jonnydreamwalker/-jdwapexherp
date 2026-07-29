from pathlib import Path
p = Path("server.js")
t = p.read_text()
t2 = t.replace("b.images.slice(0, 10)", "b.images.slice(0, 6)")
t2 = t2.replace("urls.slice(0, 10)", "urls.slice(0, 6)")

old_pub = (
    "function publicItem(i) {\n"
    "  const qty = Number(i.qty) || 0;\n"
    "  const reserved = Number(i.reserved) || 0;\n"
    "  return {\n"
    "    sku: i.sku,\n"
    "    name: i.name,\n"
    "    category: i.category || \"\",\n"
    "    description: i.description || \"\",\n"
    "    price: Number(i.price) || 0,\n"
    "    qty: qty,\n"
    "    reserved: reserved,\n"
    "    available: Math.max(0, qty - reserved),\n"
    "    status: i.status || \"active\",\n"
    "    image: (i.images && i.images[0]) || i.image || \"\",\n"
    "    images: i.images || (i.image ? [i.image] : []),\n"
    "    videos: i.videos || []\n"
    "  };\n"
    "}"
)

new_pub = (
    "function publicItem(i) {\n"
    "  const qty = Number(i.qty) || 0;\n"
    "  const reserved = Number(i.reserved) || 0;\n"
    "  let imgs = [];\n"
    "  if (Array.isArray(i.images)) imgs = i.images.filter(Boolean);\n"
    "  if (!imgs.length && i.image) imgs = [i.image];\n"
    "  imgs = imgs.slice(0, 6);\n"
    "  return {\n"
    "    sku: i.sku,\n"
    "    name: i.name,\n"
    "    category: i.category || \"\",\n"
    "    description: i.description || \"\",\n"
    "    price: Number(i.price) || 0,\n"
    "    qty: qty,\n"
    "    reserved: reserved,\n"
    "    available: Math.max(0, qty - reserved),\n"
    "    status: i.status || \"active\",\n"
    "    image: imgs[0] || \"\",\n"
    "    images: imgs,\n"
    "    videos: Array.isArray(i.videos) ? i.videos.slice(0, 2) : []\n"
    "  };\n"
    "}"
)

if old_pub in t2:
    t2 = t2.replace(old_pub, new_pub)
    print("publicItem replaced")
else:
    print("WARN: publicItem block not found")

old_api = (
    "    res.json({\n"
    "      warehouse: d.warehouse,\n"
    "      updated: d.updated,\n"
    "      publicFeed: true,\n"
    "      store: storeId,\n"
    "      items: (st.items || []).filter(isPublicListed).map(publicItem)\n"
    "    });"
)

new_api = (
    "    let items = (st.items || []).filter(isPublicListed);\n"
    "    const catQ = String(req.query.category || \"\").trim().toLowerCase();\n"
    "    if (catQ) {\n"
    "      items = items.filter(function (it) {\n"
    "        return String(it.category || \"\").trim().toLowerCase() === catQ;\n"
    "      });\n"
    "    }\n"
    "    res.json({\n"
    "      warehouse: d.warehouse,\n"
    "      updated: d.updated,\n"
    "      publicFeed: true,\n"
    "      store: storeId,\n"
    "      category: req.query.category || null,\n"
    "      items: items.map(publicItem)\n"
    "    });"
)

if old_api in t2:
    t2 = t2.replace(old_api, new_api)
    print("api/products category filter added")
else:
    print("WARN: api products block not found")

if "/admin/favicon-force.js" not in t2:
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
    if needle in t2:
        t2 = t2.replace(needle, add, 1)
        print("favicon-force route added")
    else:
        print("WARN: favicon.svg route not found")

p.write_text(t2)
print("server.js patched bytes", len(t2))
