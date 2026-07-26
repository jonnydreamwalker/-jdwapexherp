const express = require("express");
const session = require("express-session");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const PASS = process.env.ADMIN_PASSWORD || "change-me-apex";
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const DATA = path.join(__dirname, "data", "inventory.json");
const ORDERS = path.join(__dirname, "data", "orders.json");
const UPLOADS = path.join(__dirname, "data", "uploads");

/* Same mark as fulfillment page tab icon */
const FREEPORT_FAVICON_SVG =
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'>" +
  "<rect width='512' height='512' fill='#000'/>" +
  "<circle cx='256' cy='256' r='220' fill='none' stroke='#22c55e' stroke-width='28'/>" +
  "<text x='256' y='230' text-anchor='middle' font-family='Arial Black,Helvetica,sans-serif' font-size='120' font-weight='900' fill='#22c55e'>APEX</text>" +
  "<line x1='90' y1='255' x2='422' y2='255' stroke='#22c55e' stroke-width='14'/>" +
  "<text x='256' y='330' text-anchor='middle' font-family='Arial Black,Helvetica,sans-serif' font-size='72' font-weight='900' fill='#fff'>FreePort</text>" +
  "</svg>";

app.use(function (req, res, next) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,x-apex-secret");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || "apex-secret",
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 }
  })
);

if (!fs.existsSync(UPLOADS)) fs.mkdirSync(UPLOADS, { recursive: true });

app.use("/uploads", express.static(UPLOADS));

/* Always serve the FreePort mark — do not use a bad/overwritten PNG */
app.get("/favicon.ico", function (req, res) {
  res.setHeader("Cache-Control", "no-cache, max-age=0");
  var svgPath = path.join(UPLOADS, "apexfreeport-logo.svg");
  if (fs.existsSync(svgPath) && fs.statSync(svgPath).size > 50) {
    return res.type("image/svg+xml").sendFile(svgPath);
  }
  return res.type("image/svg+xml").send(FREEPORT_FAVICON_SVG);
});

app.get("/favicon.svg", function (req, res) {
  res.setHeader("Cache-Control", "no-cache, max-age=0");
  res.type("image/svg+xml").send(FREEPORT_FAVICON_SVG);
});

function defaultData() {
  return {
    updated: new Date().toISOString(),
    warehouse: "DeFuniak Springs, FL",
    stores: {
      herp: {
        name: "Apex Herp",
        publicFeed: false,
        categories: ["Hardscape", "Lighting", "Substrates", "Nutrition", "Apparel"],
        items: []
      },
      k9: {
        name: "Apex K9",
        publicFeed: false,
        categories: ["Gear", "Training", "Apparel"],
        items: []
      },
      feline: {
        name: "Apex Feline",
        publicFeed: false,
        categories: ["Gear", "Enrichment", "Apparel"],
        items: []
      }
    },
    movements: []
  };
}

function normalize(d) {
  if (!d || typeof d !== "object") return defaultData();
  if (d.stores && d.stores.herp) {
    Object.keys(d.stores).forEach(function (k) {
      var st = d.stores[k];
      if (!Array.isArray(st.categories) || !st.categories.length) {
        var seen = {};
        var cats = [];
        (st.items || []).forEach(function (it) {
          var c = it.category || "";
          if (c && !seen[c]) { seen[c] = 1; cats.push(c); }
        });
        st.categories = cats.length ? cats : ((defaultData().stores[k] && defaultData().stores[k].categories) || []);
      }
    });
    return d;
  }
  const items = Array.isArray(d.items) ? d.items : [];
  const out = defaultData();
  out.updated = d.updated || out.updated;
  out.warehouse = d.warehouse || out.warehouse;
  out.stores.herp.items = items;
  out.stores.herp.publicFeed = !!d.publicFeed;
  return out;
}

function read() {
  try {
    if (!fs.existsSync(DATA)) {
      const d = defaultData();
      write(d);
      return d;
    }
    return normalize(JSON.parse(fs.readFileSync(DATA, "utf8")));
  } catch (e) {
    return defaultData();
  }
}

function write(d) {
  d.updated = new Date().toISOString();
  fs.writeFileSync(DATA, JSON.stringify(d, null, 2));
}

function storeOf(d, id) {
  const key = id || "herp";
  if (!d.stores[key]) {
    d.stores[key] = { name: key, publicFeed: false, categories: [], items: [] };
  }
  return d.stores[key];
}

function skuLookup() {
  const map = {};
  const d = read();
  Object.keys(d.stores || {}).forEach(function (sid) {
    (d.stores[sid].items || []).forEach(function (it) {
      if (it && it.sku) map[it.sku] = it;
    });
  });
  return map;
}

function isDropShipItem(it, invMap) {
  if (it && it.dropShip === true) return true;
  if (it && it.lane === "external") return true;
  const inv = invMap && it && it.sku ? invMap[it.sku] : null;
  if (inv && (inv.dropShip === true || inv.lane === "external")) return true;
  return false;
}

function applyPhotos(item, b) {
  if (b.image != null) {
    item.image = String(b.image || "");
    if (item.image) {
      item.images = Array.isArray(b.images) && b.images.length ? b.images.slice(0, 10) : [item.image];
    } else {
      item.images = Array.isArray(b.images) ? b.images.slice(0, 10) : [];
    }
  } else if (Array.isArray(b.images)) {
    item.images = b.images.slice(0, 10);
    item.image = item.images[0] || "";
  }
  if (!Array.isArray(item.images)) item.images = item.image ? [item.image] : [];
}

function enrichOrder(o, invMap) {
  const items = (o.items || []).map(function (it) {
    const inv = invMap[it.sku] || {};
    const drop = isDropShipItem(it, invMap);
    return Object.assign({}, it, {
      dropShip: drop,
      supplier: it.supplier || inv.supplier || (drop ? "External supplier" : ""),
      shippingTerms:
        it.shippingTerms ||
        inv.shippingTerms ||
        (drop
          ? "Shipping on supplier terms — not calculated from FL warehouse"
          : "FL warehouse / direct")
    });
  });
  const hasDropShip = items.some(function (i) { return i.dropShip; });
  const hasWarehouse = items.some(function (i) { return !i.dropShip; });
  return Object.assign({}, o, {
    items: items,
    hasDropShip: hasDropShip || !!o.hasDropShip,
    hasWarehouse: hasWarehouse,
    shippingMode: hasDropShip && hasWarehouse ? "split" : hasDropShip ? "supplier" : "warehouse"
  });
}

function defaultOrders() {
  return { updated: new Date().toISOString(), warehouse: { name: "JDW Apex FreePort", state: "FL" }, orders: [] };
}

function readOrders() {
  try {
    if (!fs.existsSync(ORDERS)) {
      const d = defaultOrders();
      writeOrders(d);
      return d;
    }
    return JSON.parse(fs.readFileSync(ORDERS, "utf8"));
  } catch (e) {
    return defaultOrders();
  }
}

function writeOrders(d) {
  d.updated = new Date().toISOString();
  fs.writeFileSync(ORDERS, JSON.stringify(d, null, 2));
}

function serviceRank(s) {
  const m = { next_day: 0, overnight: 0, express: 1, priority: 2, ground: 3 };
  const k = String(s || "ground").toLowerCase();
  return m[k] != null ? m[k] : 9;
}

function sortOrders(list) {
  return (list || []).slice().sort(function (a, b) {
    const af = a.status === "fulfilled" ? 1 : 0;
    const bf = b.status === "fulfilled" ? 1 : 0;
    if (af !== bf) return af - bf;
    const sr = serviceRank(a.service) - serviceRank(b.service);
    if (sr !== 0) return sr;
    return String(a.created || "").localeCompare(String(b.created || ""));
  });
}

function findOrder(d, id) {
  return (d.orders || []).find(function (o) { return o.id === id; });
}

function auth(req, res, next) {
  if (req.session && req.session.ok) return next();
  if (req.path.startsWith("/api/")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  return res.redirect("/login");
}

function isPublicListed(i) {
  if ((i.status || "active") === "archived") return false;
  if (i.listed === false || i.listed === "false") return false;
  if (i.hidden === true) return false;
  return true;
}

function publicItem(i) {
  const qty = Number(i.qty) || 0;
  const reserved = Number(i.reserved) || 0;
  return {
    sku: i.sku,
    name: i.name,
    category: i.category || "",
    description: i.description || "",
    price: Number(i.price) || 0,
    qty: qty,
    reserved: reserved,
    available: Math.max(0, qty - reserved),
    status: i.status || "active",
    image: (i.images && i.images[0]) || i.image || "",
    images: i.images || (i.image ? [i.image] : []),
    videos: i.videos || []
  };
}

app.get("/health", function (req, res) {
  const d = read();
  res.json({
    ok: true,
    service: "ApexFreePort",
    multiStore: true,
    fulfillment: true,
    stores: {
      herp: !!(d.stores.herp && d.stores.herp.publicFeed),
      k9: !!(d.stores.k9 && d.stores.k9.publicFeed),
      feline: !!(d.stores.feline && d.stores.feline.publicFeed)
    },
    square: process.env.SQUARE_ACCESS_TOKEN ? "token-set" : "no-token",
    stripe: process.env.STRIPE_SECRET_KEY ? "token-set" : "no-token",
    paypal: process.env.PAYPAL_CLIENT_ID ? "client-set" : "no-client"
  });
});

app.get("/api/products", function (req, res) {
  try {
    const d = read();
    const storeId = (req.query.store || "herp").toLowerCase();
    const st = storeOf(d, storeId);
    if (!st.publicFeed) {
      return res.status(503).json({
        error: "feed_off",
        message: "Inventory bridge offline. Check ApexFreePort node.",
        publicFeed: false,
        store: storeId
      });
    }
    res.json({
      warehouse: d.warehouse,
      updated: d.updated,
      publicFeed: true,
      store: storeId,
      items: (st.items || []).filter(isPublicListed).map(publicItem)
    });
  } catch (e) {
    res.status(500).json({ error: "fail" });
  }
});

app.get("/api/stock", function (req, res) {
  try { res.json(read()); } catch (e) { res.status(500).json({ error: "fail" }); }
});

app.get("/login", function (req, res) {
  if (req.session && req.session.ok) return res.redirect("/admin");
  res.sendFile(path.join(__dirname, "admin", "login.html"));
});

app.post("/login", function (req, res) {
  const user = (req.body && req.body.username) || "";
  const pass = (req.body && req.body.password) || "";
  const userOk = !ADMIN_USER || user === ADMIN_USER || user === "";
  if (userOk && pass === PASS) {
    req.session.ok = true;
    return res.redirect("/admin");
  }
  return res.redirect("/login?err=1");
});

app.post("/logout", function (req, res) {
  req.session.destroy(function () { res.redirect("/login"); });
});

app.get("/admin", auth, function (req, res) {
  res.sendFile(path.join(__dirname, "admin", "index.html"));
});

app.get("/admin/fulfillment", auth, function (req, res) {
  res.sendFile(path.join(__dirname, "admin", "fulfillment.html"));
});

app.get("/api/inventory", auth, function (req, res) {
  const d = read();
  const storeId = (req.query.store || "herp").toLowerCase();
  const st = storeOf(d, storeId);
  const stores = Object.keys(d.stores).map(function (id) {
    return {
      id: id,
      name: d.stores[id].name || id,
      count: (d.stores[id].items || []).length,
      publicFeed: !!d.stores[id].publicFeed
    };
  });
  res.json({
    warehouse: d.warehouse,
    updated: d.updated,
    store: storeId,
    storeName: st.name || storeId,
    publicFeed: !!st.publicFeed,
    categories: st.categories || [],
    items: st.items || [],
    stores: stores
  });
});

app.post("/api/admin/public-feed", auth, function (req, res) {
  const d = read();
  const storeId = ((req.body && req.body.store) || "herp").toLowerCase();
  const st = storeOf(d, storeId);
  st.publicFeed = !!(req.body && req.body.enabled);
  write(d);
  res.json({ ok: true, store: storeId, publicFeed: st.publicFeed });
});

app.post("/api/inventory/item", auth, function (req, res) {
  const d = read();
  const b = req.body || {};
  const storeId = (b.store || "herp").toLowerCase();
  const st = storeOf(d, storeId);
  const sku = String(b.sku || "").trim();
  const original = String(b.originalSku || sku).trim();
  if (!sku) return res.status(400).json({ error: "sku required" });

  const dropShip = b.dropShip === true || b.dropShip === "true" || b.dropShip === 1;
  let lane = b.lane || "direct";
  if (dropShip && lane === "direct") lane = "external";

  let item = (st.items || []).find(function (i) {
    return i.sku === original || i.sku === sku;
  });
  if (!item) {
    item = {
      sku: sku,
      name: b.name || sku,
      category: b.category || "",
      description: b.description || "",
      price: Number(b.price) || 0,
      qty: Number(b.qty) || 0,
      reserved: Number(b.reserved) || 0,
      lane: lane,
      dropShip: dropShip,
      supplier: b.supplier || "",
      shippingTerms: b.shippingTerms || (dropShip ? "Supplier ships — rate on their terms" : ""),
      status: b.status || "active",
      location: b.location || "",
      listed: true,
      image: "",
      images: [],
      videos: []
    };
    st.items.push(item);
  } else {
    item.sku = sku;
    if (b.name != null) item.name = b.name;
    if (b.category != null) item.category = b.category;
    if (b.description != null) item.description = b.description;
    if (b.price != null) item.price = Number(b.price) || 0;
    if (b.qty != null) item.qty = Number(b.qty) || 0;
    if (b.reserved != null) item.reserved = Number(b.reserved) || 0;
    if (b.lane != null) item.lane = b.lane;
    if (b.dropShip != null) item.dropShip = dropShip;
    if (b.supplier != null) item.supplier = b.supplier;
    if (b.shippingTerms != null) item.shippingTerms = b.shippingTerms;
    if (item.dropShip && (!item.lane || item.lane === "direct")) item.lane = "external";
    if (b.status != null) item.status = b.status;
    if (b.location != null) item.location = b.location;
  }
  if (b.listed != null) {
    item.listed = !(b.listed === false || b.listed === "false" || b.listed === 0);
  }
  applyPhotos(item, b);
  if (item.category && (st.categories || []).indexOf(item.category) < 0) {
    st.categories = st.categories || [];
    st.categories.push(item.category);
  }
  write(d);
  res.json({ ok: true, item: item });
});

app.post("/api/inventory/adjust", auth, function (req, res) {
  const d = read();
  const b = req.body || {};
  const storeId = (b.store || "herp").toLowerCase();
  const st = storeOf(d, storeId);
  const item = (st.items || []).find(function (i) { return i.sku === b.sku; });
  if (!item) return res.status(404).json({ error: "not found" });
  item.qty = Math.max(0, (Number(item.qty) || 0) + (Number(b.delta) || 0));
  write(d);
  res.json({ ok: true, item: item });
});

app.post("/api/inventory/remove", auth, function (req, res) {
  const d = read();
  const b = req.body || {};
  const storeId = (b.store || "herp").toLowerCase();
  const st = storeOf(d, storeId);
  const stItems = st.items || [];
  st.items = stItems.filter(function (i) { return i.sku !== b.sku; });
  write(d);
  res.json({ ok: true });
});

app.post("/api/inventory/reorder", auth, function (req, res) {
  const d = read();
  const b = req.body || {};
  const storeId = (b.store || "herp").toLowerCase();
  const st = storeOf(d, storeId);
  const items = st.items || [];
  const idx = items.findIndex(function (i) { return i.sku === b.sku; });
  if (idx < 0) return res.status(404).json({ error: "not found" });
  const dir = b.direction === "up" ? -1 : 1;
  const j = idx + dir;
  if (j < 0 || j >= items.length) return res.json({ ok: true });
  const tmp = items[idx];
  items[idx] = items[j];
  items[j] = tmp;
  write(d);
  res.json({ ok: true });
});

app.post("/api/inventory/category", auth, function (req, res) {
  const d = read();
  const b = req.body || {};
  const storeId = (b.store || "herp").toLowerCase();
  const st = storeOf(d, storeId);
  const name = String(b.name || "").trim();
  if (!name) return res.status(400).json({ error: "name required" });
  st.categories = st.categories || [];
  if (st.categories.indexOf(name) < 0) st.categories.push(name);
  write(d);
  res.json({ ok: true, categories: st.categories });
});

app.post("/api/inventory/images", auth, function (req, res) {
  const d = read();
  const b = req.body || {};
  const storeId = (b.store || "herp").toLowerCase();
  const st = storeOf(d, storeId);
  const item = (st.items || []).find(function (i) { return i.sku === b.sku; });
  if (!item) return res.status(404).json({ error: "not found" });
  item.images = item.images || [];
  const urls = Array.isArray(b.dataUrls) ? b.dataUrls : [];
  urls.slice(0, 10).forEach(function (u) {
    if (typeof u === "string" && u.indexOf("data:") === 0) item.images.push(u);
  });
  if (item.images[0]) item.image = item.images[0];
  write(d);
  res.json({ ok: true, images: item.images });
});

app.post("/api/inventory/videos", auth, function (req, res) {
  const d = read();
  const b = req.body || {};
  const storeId = (b.store || "herp").toLowerCase();
  const st = storeOf(d, storeId);
  const item = (st.items || []).find(function (i) { return i.sku === b.sku; });
  if (!item) return res.status(404).json({ error: "not found" });
  item.videos = item.videos || [];
  const urls = Array.isArray(b.dataUrls) ? b.dataUrls : [];
  urls.slice(0, 2).forEach(function (u) {
    if (typeof u === "string" && u.indexOf("data:") === 0) item.videos.push(u);
  });
  write(d);
  res.json({ ok: true, videos: item.videos });
});

app.get("/api/fulfillment/orders", auth, function (req, res) {
  try {
    const d = readOrders();
    const inv = skuLookup();
    const orders = sortOrders(d.orders || []).map(function (o) {
      return enrichOrder(o, inv);
    });
    res.json({ updated: d.updated, orders: orders });
  } catch (e) {
    res.status(500).json({ error: "fail" });
  }
});

app.post("/api/fulfillment/orders/:id/complete", auth, function (req, res) {
  const d = readOrders();
  const o = findOrder(d, req.params.id);
  if (!o) return res.status(404).json({ error: "not found" });
  o.status = "fulfilled";
  o.fulfilledAt = new Date().toISOString();
  writeOrders(d);
  res.json({ ok: true, order: o });
});

app.post("/api/fulfillment/orders/:id/reopen", auth, function (req, res) {
  const d = readOrders();
  const o = findOrder(d, req.params.id);
  if (!o) return res.status(404).json({ error: "not found" });
  o.status = "open";
  o.fulfilledAt = null;
  writeOrders(d);
  res.json({ ok: true, order: o });
});

app.post("/api/fulfillment/orders/:id/note", auth, function (req, res) {
  const d = readOrders();
  const o = findOrder(d, req.params.id);
  if (!o) return res.status(404).json({ error: "not found" });
  const note = String((req.body && req.body.note) || "").trim();
  if (!note) return res.status(400).json({ error: "note required" });
  o.notes = o.notes || [];
  o.notes.push(note);
  writeOrders(d);
  res.json({ ok: true, order: o });
});

app.post("/api/fulfillment/orders/:id/printed", auth, function (req, res) {
  const d = readOrders();
  const o = findOrder(d, req.params.id);
  if (!o) return res.status(404).json({ error: "not found" });
  o.labelPrintedAt = new Date().toISOString();
  writeOrders(d);
  res.json({ ok: true, order: o });
});

app.get("/api/fulfillment/orders/:id/label", auth, function (req, res) {
  const d = readOrders();
  const inv = skuLookup();
  const raw = findOrder(d, req.params.id);
  if (!raw) return res.status(404).send("Order not found");
  const o = enrichOrder(raw, inv);
  const st = o.shipTo || {};
  const items = (o.items || []).map(function (it) {
    const ds = it.dropShip ? " <strong style=color:#b45309>[DROP SHIP — ORDER]</strong>" : "";
    return "<tr><td>" + it.sku + "</td><td>" + it.name + ds + "</td><td>×" + it.qty + "</td></tr>";
  }).join("");
  const boxes = (o.boxes || []).map(function (b, i) {
    return "<p><strong>Box " + (i + 1) + ": " + (b.size || "") + "</strong><br>" +
      (b.contents || []).join(", ") + "<br>Marks: " + ((b.handling || []).join(", ") || "none") + "</p>";
  }).join("");
  const handling = (o.handling || []).join(" · ") || "none";
  const dsNote = o.hasDropShip
    ? "<p style=background:#fff7ed;border:1px solid #fdba74;padding:10px><strong>DROP SHIP:</strong> Order supplier lines. Shipping for those lines is on the supplier's terms — not FL warehouse rates.</p>"
    : "";
  const html = "<!DOCTYPE html><html><head><meta charset=utf-8><title>Label " + o.id + "</title>" +
    "<style>body{font-family:system-ui,sans-serif;max-width:420px;margin:24px auto;padding:16px}" +
    "h1{font-size:18px;margin:0 0 8px}.svc{color:#b45309;font-weight:800}" +
    "table{width:100%;border-collapse:collapse;margin:12px 0}td,th{border-bottom:1px solid #ccc;padding:6px;text-align:left;font-size:13px}" +
    ".box{border:2px dashed #333;padding:12px;margin:12px 0}.marks{font-size:20px;font-weight:900;letter-spacing:.04em}" +
    "@media print{.noprint{display:none}}</style></head><body>" +
    "<p class=noprint><button onclick=window.print()>Print</button></p>" +
    "<h1>Apex FreePort · " + o.id + "</h1>" +
    "<p class=svc>" + (o.serviceLabel || o.service || "") + "</p>" + dsNote +
    "<div class=box><strong>SHIP TO</strong><br>" +
    (st.name || "") + "<br>" + (st.line1 || "") + (st.line2 ? "<br>" + st.line2 : "") +
    "<br>" + (st.city || "") + ", " + (st.state || "") + " " + (st.zip || "") +
    "</div>" +
    "<p class=marks>" + handling + "</p>" +
    "<h2 style=font-size:14px>Pack / order list</h2><table><thead><tr><th>SKU</th><th>Item</th><th>Qty</th></tr></thead><tbody>" +
    items + "</tbody></table>" + boxes +
    "<p style=font-size:11px;color:#666>Warehouse: DeFuniak Springs, FL · Pack slip — postage via Pirate Ship / carrier when ready.</p>" +
    "<script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script>" +
    "</body></html>";
  res.type("html").send(html);
});

app.get("/", function (req, res) { res.redirect("/admin"); });

app.listen(PORT, function () {
  console.log("ApexFreePort on " + PORT);
  console.log("Square: " + (process.env.SQUARE_ACCESS_TOKEN ? "set" : "no"));
  console.log("Fulfillment: /admin/fulfillment");
});
