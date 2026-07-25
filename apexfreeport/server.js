const express = require("express");
const session = require("express-session");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const PASS = process.env.ADMIN_PASSWORD || "change-me-apex";
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const DATA = path.join(__dirname, "data", "inventory.json");
const UPLOADS = path.join(__dirname, "data", "uploads");

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
  if (d.stores && d.stores.herp) return d;
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

function auth(req, res, next) {
  if (req.session && req.session.ok) return next();
  if (req.path.startsWith("/api/")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  return res.redirect("/login");
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
    lane: i.lane || "direct",
    status: i.status || "active",
    image: (i.images && i.images[0]) || i.image || "",
    images: i.images || [],
    videos: i.videos || [],
    location: i.location || ""
  };
}

app.get("/health", function (req, res) {
  const d = read();
  res.json({
    ok: true,
    service: "ApexFreePort",
    multiStore: true,
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
      items: (st.items || [])
        .filter(function (i) { return (i.status || "active") !== "archived"; })
        .map(publicItem)
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
      lane: b.lane || "direct",
      status: b.status || "active",
      location: b.location || "",
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
    if (b.status != null) item.status = b.status;
    if (b.location != null) item.location = b.location;
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
  st.items = (st.items || []).filter(function (i) { return i.sku !== b.sku; });
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

app.get("/", function (req, res) { res.redirect("/admin"); });

app.listen(PORT, function () {
  console.log("ApexFreePort on " + PORT);
  console.log("Square: " + (process.env.SQUARE_ACCESS_TOKEN ? "set" : "no"));
});
