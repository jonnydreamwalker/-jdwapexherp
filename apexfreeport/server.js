const express = require("express");
const session = require("express-session");
const fs = require("fs");
const path = require("path");
const app = express();
const PORT = process.env.PORT || 3000;
const PASS = process.env.ADMIN_PASSWORD || "change-me-apex";
const DATA = path.join(__dirname, "data", "inventory.json");
const REVIEWS = path.join(__dirname, "data", "reviews.json");
const UPLOADS = path.join(__dirname, "data", "uploads");
const STORE_IDS = ["herp", "k9", "feline"];
const STORE_META = {
  herp: {
    name: "Apex Herp",
    defaultCategories: [
      "Hardscape",
      "Lighting",
      "Substrates",
      "Nutrition",
      "Apparel",
      "Enclosures",
      "Heating",
      "Hardware",
      "Deals",
    ],
  },
  k9: {
    name: "Apex K9",
    defaultCategories: ["Food", "Gear", "Training", "Beds", "Health", "Apparel", "Deals"],
  },
  feline: {
    name: "Apex Feline",
    defaultCategories: ["Food", "Litter", "Play", "Beds", "Health", "Apparel", "Deals"],
  },
};
if (!fs.existsSync(UPLOADS)) fs.mkdirSync(UPLOADS, { recursive: true });
if (!fs.existsSync(REVIEWS)) fs.writeFileSync(REVIEWS, JSON.stringify({ updated: null, reviews: [] }, null, 2));

app.use(function (req, res, next) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,x-apex-secret,stripe-signature");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: "12mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: process.env.SESSION_SECRET || "apex-secret", resave: false, saveUninitialized: false }));
app.use("/uploads", express.static(UPLOADS));

function normalizeStoreId(id) {
  id = String(id || "herp").toLowerCase();
  return STORE_IDS.indexOf(id) >= 0 ? id : "herp";
}

function ensureCategories(st, storeId) {
  var defaults = (STORE_META[storeId] && STORE_META[storeId].defaultCategories) || ["General"];
  if (!Array.isArray(st.categories) || !st.categories.length) {
    var fromItems = [];
    (st.items || []).forEach(function (it) {
      var c = String(it.category || "").trim();
      if (c && fromItems.indexOf(c) < 0) fromItems.push(c);
    });
    st.categories = defaults.slice();
    fromItems.forEach(function (c) {
      if (st.categories.indexOf(c) < 0) st.categories.push(c);
    });
  }
  return st.categories;
}

function normalizeImages(item) {
  var imgs = [];
  if (Array.isArray(item.images)) {
    item.images.forEach(function (p) {
      if (p && imgs.indexOf(p) < 0) imgs.push(p);
    });
  }
  if (item.image && imgs.indexOf(item.image) < 0) imgs.unshift(item.image);
  imgs = imgs.slice(0, 10);
  item.images = imgs;
  item.image = imgs[0] || "";
  return imgs;
}

function migrate(d) {
  if (!d || typeof d !== "object") d = {};
  if (!d.stores) {
    var oldItems = Array.isArray(d.items) ? d.items : [];
    var oldFeed = typeof d.publicFeed === "boolean" ? d.publicFeed : false;
    d.stores = {
      herp: { id: "herp", name: "Apex Herp", publicFeed: oldFeed, items: oldItems },
      k9: { id: "k9", name: "Apex K9", publicFeed: false, items: [] },
      feline: { id: "feline", name: "Apex Feline", publicFeed: false, items: [] },
    };
    delete d.items;
    delete d.publicFeed;
  }
  STORE_IDS.forEach(function (id) {
    if (!d.stores[id]) {
      d.stores[id] = { id: id, name: STORE_META[id].name, publicFeed: false, items: [] };
    }
    if (typeof d.stores[id].publicFeed !== "boolean") d.stores[id].publicFeed = false;
    if (!Array.isArray(d.stores[id].items)) d.stores[id].items = [];
    d.stores[id].id = id;
    d.stores[id].name = d.stores[id].name || STORE_META[id].name;
    ensureCategories(d.stores[id], id);
    d.stores[id].items.forEach(normalizeImages);
  });
  if (!d.warehouse) d.warehouse = "DeFuniak Springs, FL";
  if (!Array.isArray(d.movements)) d.movements = [];
  return d;
}

function read() {
  return migrate(JSON.parse(fs.readFileSync(DATA, "utf8")));
}
function write(d) {
  d.updated = new Date().toISOString();
  fs.writeFileSync(DATA, JSON.stringify(d, null, 2));
}
function storeOf(d, id) {
  return d.stores[normalizeStoreId(id)];
}
function findItemIndex(items, sku) {
  sku = String(sku || "").trim();
  for (var i = 0; i < items.length; i++) {
    if (String(items[i].sku).trim() === sku) return i;
  }
  return -1;
}
function auth(req, res, next) {
  if (req.session && req.session.ok) return next();
  if (req.path.indexOf("/api/") === 0) return res.status(401).json({ error: "Unauthorized" });
  res.redirect("/login");
}
function publicItem(i) {
  var imgs = normalizeImages(i);
  return {
    sku: i.sku,
    name: i.name,
    category: i.category || "",
    description: i.description || "",
    price: Number(i.price) || 0,
    qty: i.qty || 0,
    reserved: i.reserved || 0,
    available: Math.max(0, (i.qty || 0) - (i.reserved || 0)),
    lane: i.lane || "direct",
    status: i.status || "active",
    image: imgs[0] || "",
    images: imgs,
    location: i.location || "",
  };
}
function feedOff(res, storeId) {
  return res.status(503).json({
    error: "public_feed_off",
    message: "Website inventory feed is OFF for this store.",
    store: storeId,
    publicFeed: false,
    items: [],
  });
}

function saveDataUrl(storeId, sku, dataUrl) {
  var m = String(dataUrl).match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/);
  if (!m) return null;
  var ext = m[1] === "jpeg" ? "jpg" : m[1];
  var safe = String(sku).replace(/[^a-zA-Z0-9_-]/g, "_");
  var fname = storeId + "-" + safe + "-" + Date.now() + "-" + Math.floor(Math.random() * 9999) + "." + ext;
  var buf = Buffer.from(m[2], "base64");
  if (buf.length > 1500000) return null;
  fs.writeFileSync(path.join(UPLOADS, fname), buf);
  return "/uploads/" + fname;
}

app.get("/health", function (req, res) {
  var d;
  try { d = read(); } catch (e) { d = { stores: {} }; }
  var feeds = {};
  STORE_IDS.forEach(function (id) {
    feeds[id] = !!(d.stores && d.stores[id] && d.stores[id].publicFeed);
  });
  res.json({
    ok: true,
    service: "ApexFreePort",
    multiStore: true,
    stores: feeds,
    square: process.env.SQUARE_ACCESS_TOKEN ? "token-set" : "no-token",
    stripe: process.env.STRIPE_SECRET_KEY ? "token-set" : "no-token",
    paypal: process.env.PAYPAL_CLIENT_ID ? "client-set" : "no-client",
  });
});

app.get("/api/stock", function (req, res) {
  try {
    var storeId = normalizeStoreId(req.query.store);
    var d = read();
    var st = storeOf(d, storeId);
    if (!st.publicFeed) return feedOff(res, storeId);
    res.json({
      store: storeId,
      storeName: st.name,
      warehouse: d.warehouse,
      updated: d.updated,
      publicFeed: true,
      items: (st.items || []).map(publicItem),
    });
  } catch (e) {
    res.status(500).json({ error: "fail" });
  }
});

app.get("/api/products", function (req, res) {
  try {
    var storeId = normalizeStoreId(req.query.store);
    var d = read();
    var st = storeOf(d, storeId);
    if (!st.publicFeed) return feedOff(res, storeId);
    var items = (st.items || []).map(publicItem);
    if (req.query.category) {
      var cat = String(req.query.category).toLowerCase();
      items = items.filter(function (i) {
        return (i.category || "").toLowerCase() === cat;
      });
    }
    res.json({
      store: storeId,
      storeName: st.name,
      warehouse: d.warehouse,
      updated: d.updated,
      publicFeed: true,
      items: items,
    });
  } catch (e) {
    res.status(500).json({ error: "fail" });
  }
});

app.get("/login", function (req, res) {
  if (req.session.ok) return res.redirect("/admin");
  res.sendFile(path.join(__dirname, "admin", "login.html"));
});
app.post("/login", function (req, res) {
  if (req.body && req.body.password === PASS) {
    req.session.ok = true;
    return res.redirect("/admin");
  }
  res.redirect("/login?err=1");
});
app.post("/logout", function (req, res) {
  req.session.destroy(function () {
    res.redirect("/login");
  });
});
app.get("/admin", auth, function (req, res) {
  res.sendFile(path.join(__dirname, "admin", "index.html"));
});

app.get("/api/inventory", auth, function (req, res) {
  var storeId = normalizeStoreId(req.query.store);
  var d = read();
  var st = storeOf(d, storeId);
  var cats = ensureCategories(st, storeId);
  res.json({
    warehouse: d.warehouse,
    updated: d.updated,
    store: storeId,
    storeName: st.name,
    publicFeed: !!st.publicFeed,
    categories: cats,
    items: (st.items || []).map(function (it) {
      normalizeImages(it);
      return it;
    }),
    stores: STORE_IDS.map(function (id) {
      return {
        id: id,
        name: d.stores[id].name,
        publicFeed: !!d.stores[id].publicFeed,
        count: (d.stores[id].items || []).length,
      };
    }),
  });
});

app.post("/api/admin/public-feed", auth, function (req, res) {
  var storeId = normalizeStoreId((req.body || {}).store || req.query.store);
  var d = read();
  var st = storeOf(d, storeId);
  if (typeof (req.body || {}).enabled === "boolean") st.publicFeed = req.body.enabled;
  else st.publicFeed = !st.publicFeed;
  write(d);
  res.json({ ok: true, store: storeId, publicFeed: st.publicFeed });
});

app.post("/api/inventory/adjust", auth, function (req, res) {
  var storeId = normalizeStoreId((req.body || {}).store);
  var d = read();
  var st = storeOf(d, storeId);
  var idx = findItemIndex(st.items, req.body.sku);
  if (idx < 0) return res.status(404).json({ error: "not found" });
  var item = st.items[idx];
  item.qty = Math.max(0, (item.qty || 0) + Number(req.body.delta || 0));
  write(d);
  res.json({ ok: true, item: publicItem(item) });
});

app.post("/api/inventory/reorder", auth, function (req, res) {
  var b = req.body || {};
  var storeId = normalizeStoreId(b.store);
  var sku = String(b.sku || "").trim();
  var dir = b.direction === "up" ? -1 : 1;
  var d = read();
  var st = storeOf(d, storeId);
  var idx = findItemIndex(st.items, sku);
  if (idx < 0) return res.status(404).json({ error: "not found" });
  var j = idx + dir;
  if (j < 0 || j >= st.items.length) return res.json({ ok: true, moved: false });
  var tmp = st.items[idx];
  st.items[idx] = st.items[j];
  st.items[j] = tmp;
  write(d);
  res.json({ ok: true, moved: true });
});

app.post("/api/inventory/category", auth, function (req, res) {
  var b = req.body || {};
  var storeId = normalizeStoreId(b.store);
  var name = String(b.name || "").trim();
  if (!name) return res.status(400).json({ error: "name required" });
  var d = read();
  var st = storeOf(d, storeId);
  ensureCategories(st, storeId);
  var exists = st.categories.some(function (c) {
    return String(c).toLowerCase() === name.toLowerCase();
  });
  if (!exists) st.categories.push(name);
  write(d);
  res.json({ ok: true, categories: st.categories });
});

app.post("/api/inventory/item", auth, function (req, res) {
  var b = req.body || {};
  if (!b.sku || !b.name) return res.status(400).json({ error: "sku and name required" });
  var storeId = normalizeStoreId(b.store);
  var d = read();
  var st = storeOf(d, storeId);
  ensureCategories(st, storeId);
  var newSku = String(b.sku).trim();
  var lookupSku = String(b.originalSku || b.sku).trim();
  var idx = findItemIndex(st.items, lookupSku);
  if (idx < 0 && lookupSku !== newSku) idx = findItemIndex(st.items, newSku);

  var cat = String(b.category || "").trim() || "General";
  if (st.categories.indexOf(cat) < 0) st.categories.push(cat);

  var prev = idx >= 0 ? st.items[idx] : {};
  var prevImgs = normalizeImages(prev);
  var row = {
    sku: newSku,
    name: String(b.name).trim(),
    category: cat,
    description: b.description != null ? b.description : prev.description || "",
    price: b.price != null ? Number(b.price) || 0 : Number(prev.price) || 0,
    qty: b.qty != null ? Number(b.qty) || 0 : Number(prev.qty) || 0,
    reserved: b.reserved != null ? Number(b.reserved) || 0 : Number(prev.reserved) || 0,
    reorder: b.reorder != null ? Number(b.reorder) || 0 : Number(prev.reorder) || 0,
    lane: b.lane === "external" ? "external" : b.lane === "direct" ? "direct" : prev.lane || "direct",
    status: b.status || prev.status || "active",
    image: prev.image || "",
    images: prevImgs.slice(),
    location: b.location || prev.location || "WH-A1",
    unit: b.unit || prev.unit || "each",
  };
  if (b.image != null && b.image !== "") {
    row.image = b.image;
    if (row.images.indexOf(b.image) < 0) row.images.unshift(b.image);
  }
  normalizeImages(row);

  if (idx >= 0) {
    st.items[idx] = Object.assign({}, prev, row);
    row = st.items[idx];
  } else {
    st.items.push(row);
  }
  write(d);
  res.json({ ok: true, store: storeId, updated: idx >= 0, item: publicItem(row), categories: st.categories });
});

app.post("/api/inventory/remove", auth, function (req, res) {
  var b = req.body || {};
  var sku = String(b.sku || "").trim();
  if (!sku) return res.status(400).json({ error: "sku required" });
  var storeId = normalizeStoreId(b.store);
  var d = read();
  var st = storeOf(d, storeId);
  var idx = findItemIndex(st.items, sku);
  if (idx < 0) return res.status(404).json({ error: "not found" });
  var removed = st.items.splice(idx, 1)[0];
  write(d);
  res.json({ ok: true, deleted: removed.sku, store: storeId });
});

/** Single image (legacy) or append one */
app.post("/api/inventory/image", auth, function (req, res) {
  try {
    var b = req.body || {};
    if (!b.sku || !b.dataUrl) return res.status(400).json({ error: "sku and dataUrl required" });
    var storeId = normalizeStoreId(b.store);
    var url = saveDataUrl(storeId, b.sku, b.dataUrl);
    if (!url) return res.status(400).json({ error: "bad or large image" });
    var d = read();
    var st = storeOf(d, storeId);
    var idx = findItemIndex(st.items, b.sku);
    if (idx < 0) return res.status(404).json({ error: "save product first" });
    var item = st.items[idx];
    normalizeImages(item);
    if (item.images.length >= 10) return res.status(400).json({ error: "max 10 images" });
    item.images.push(url);
    item.image = item.images[0];
    write(d);
    res.json({ ok: true, image: url, images: item.images });
  } catch (e) {
    res.status(500).json({ error: "upload failed" });
  }
});

/** Multi upload: body.dataUrls = array of data URLs, max 10 total per product */
app.post("/api/inventory/images", auth, function (req, res) {
  try {
    var b = req.body || {};
    if (!b.sku) return res.status(400).json({ error: "sku required" });
    var list = Array.isArray(b.dataUrls) ? b.dataUrls : b.dataUrl ? [b.dataUrl] : [];
    if (!list.length) return res.status(400).json({ error: "dataUrls required" });
    var storeId = normalizeStoreId(b.store);
    var d = read();
    var st = storeOf(d, storeId);
    var idx = findItemIndex(st.items, b.sku);
    if (idx < 0) return res.status(404).json({ error: "save product first" });
    var item = st.items[idx];
    normalizeImages(item);
    var added = [];
    for (var i = 0; i < list.length; i++) {
      if (item.images.length >= 10) break;
      var url = saveDataUrl(storeId, b.sku, list[i]);
      if (url) {
        item.images.push(url);
        added.push(url);
      }
    }
    item.image = item.images[0] || "";
    write(d);
    res.json({ ok: true, added: added, images: item.images });
  } catch (e) {
    res.status(500).json({ error: "upload failed" });
  }
});

app.post("/api/webhook/square", function (req, res) {
  res.json({ ok: true });
});
app.post("/api/webhook/stripe", function (req, res) {
  res.json({ ok: true });
});
app.post("/api/webhook/paypal", function (req, res) {
  res.sendStatus(200);
});

app.get("/", function (req, res) {
  res.redirect("/admin");
});
app.listen(PORT, function () {
  console.log("ApexFreePort multi-store on " + PORT);
});
