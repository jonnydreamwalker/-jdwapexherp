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
if (!fs.existsSync(UPLOADS)) fs.mkdirSync(UPLOADS, { recursive: true });
if (!fs.existsSync(REVIEWS)) fs.writeFileSync(REVIEWS, JSON.stringify({ updated: null, reviews: [] }, null, 2));
app.use(function (req, res, next) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,x-apex-secret,stripe-signature");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: process.env.SESSION_SECRET || "apex-secret", resave: false, saveUninitialized: false }));
app.use("/uploads", express.static(UPLOADS));
function read() {
  var d = JSON.parse(fs.readFileSync(DATA, "utf8"));
  if (typeof d.publicFeed !== "boolean") d.publicFeed = false;
  return d;
}
function write(d) {
  d.updated = new Date().toISOString();
  fs.writeFileSync(DATA, JSON.stringify(d, null, 2));
}
function readReviews() {
  try { return JSON.parse(fs.readFileSync(REVIEWS, "utf8")); }
  catch (e) { return { updated: null, reviews: [] }; }
}
function writeReviews(d) {
  d.updated = new Date().toISOString();
  fs.writeFileSync(REVIEWS, JSON.stringify(d, null, 2));
}
function auth(req, res, next) {
  if (req.session && req.session.ok) return next();
  if (req.path.indexOf("/api/") === 0) return res.status(401).json({ error: "Unauthorized" });
  res.redirect("/login");
}
function publicItem(i) {
  return {
    sku: i.sku, name: i.name, category: i.category || "", description: i.description || "",
    price: Number(i.price) || 0, qty: i.qty || 0, reserved: i.reserved || 0,
    available: Math.max(0, (i.qty || 0) - (i.reserved || 0)), lane: i.lane || "direct",
    status: i.status || "active", image: i.image || "", location: i.location || ""
  };
}
function feedOff(res) {
  return res.status(503).json({
    error: "public_feed_off",
    message: "Website inventory feed is OFF. Flip the red switch in ApexFreePort to go live.",
    publicFeed: false,
    items: []
  });
}
function decrementSku(sku, qty, reason) {
  qty = Math.max(1, Number(qty) || 1);
  var d = read();
  var item = null;
  for (var i = 0; i < d.items.length; i++) if (d.items[i].sku === sku) item = d.items[i];
  if (!item) return { ok: false, error: "sku not found", sku: sku };
  item.qty = Math.max(0, (item.qty || 0) - qty);
  d.movements = d.movements || [];
  d.movements.unshift({ ts: new Date().toISOString(), sku: sku, delta: -qty, reason: reason || "sale", qtyAfter: item.qty });
  d.movements = d.movements.slice(0, 200);
  write(d);
  return { ok: true, sku: sku, qty: item.qty };
}
function extractSkusFromSquarePayment(payment) {
  var found = [];
  if (!payment) return found;
  var blob = String((payment.note || "") + " " + (payment.reference_id || "")).toUpperCase();
  var d = read();
  (d.items || []).forEach(function (it) {
    if (blob.indexOf(String(it.sku).toUpperCase()) !== -1) found.push({ sku: it.sku, quantity: 1 });
  });
  return found;
}
function extractSkusFromStripeEvent(event) {
  var found = [];
  var obj = event && event.data && event.data.object;
  if (!obj) return found;
  var meta = obj.metadata || {};
  if (meta.sku) found.push({ sku: meta.sku, quantity: Number(meta.quantity) || 1 });
  return found;
}
function extractSkusFromPaypalEvent(body) {
  var found = [];
  var res = body && body.resource;
  if (!res) return found;
  var custom = String(res.custom_id || res.invoice_id || "");
  var d = read();
  (d.items || []).forEach(function (it) {
    if (custom.toUpperCase().indexOf(String(it.sku).toUpperCase()) !== -1) found.push({ sku: it.sku, quantity: 1 });
  });
  return found;
}
app.get("/health", function (req, res) {
  var d;
  try { d = read(); } catch (e) { d = { publicFeed: false }; }
  res.json({
    ok: true,
    service: "ApexFreePort",
    publicFeed: !!d.publicFeed,
    square: process.env.SQUARE_ACCESS_TOKEN ? "token-set" : "no-token",
    stripe: process.env.STRIPE_SECRET_KEY ? "token-set" : "no-token",
    paypal: process.env.PAYPAL_CLIENT_ID ? "client-set" : "no-client",
    etsy: process.env.ETSY_KEYSTRING ? "key-set" : "no-key",
    etsyShop: process.env.ETSY_SHOP_NAME || null,
  });
});
app.get("/api/stock", function (req, res) {
  try {
    var d = read();
    if (!d.publicFeed) return feedOff(res);
    res.json({ warehouse: d.warehouse, updated: d.updated, publicFeed: true, items: (d.items || []).map(publicItem) });
  } catch (e) { res.status(500).json({ error: "fail" }); }
});
app.get("/api/products", function (req, res) {
  try {
    var d = read();
    if (!d.publicFeed) return feedOff(res);
    var items = (d.items || []).map(publicItem);
    if (req.query.category) {
      var cat = String(req.query.category).toLowerCase();
      items = items.filter(function (i) { return (i.category || "").toLowerCase() === cat; });
    }
    res.json({ warehouse: d.warehouse, updated: d.updated, publicFeed: true, items: items });
  } catch (e) { res.status(500).json({ error: "fail" }); }
});
app.get("/api/reviews", function (req, res) {
  try {
    var d = readReviews();
    var approved = (d.reviews || []).filter(function (r) { return r.status === "approved"; });
    var sum = 0;
    approved.forEach(function (r) { sum += Number(r.stars) || 0; });
    var avg = approved.length ? sum / approved.length : 0;
    res.json({
      average: Math.round(avg * 10) / 10,
      count: approved.length,
      reviews: approved.map(function (r) {
        return { id: r.id, stars: r.stars, name: r.name, text: r.text, created: r.created, page: r.page || "" };
      }),
    });
  } catch (e) { res.status(500).json({ error: "fail" }); }
});
app.post("/api/reviews", function (req, res) {
  try {
    var b = req.body || {};
    var stars = Math.min(5, Math.max(1, Number(b.stars) || 0));
    var text = String(b.text || "").trim().slice(0, 800);
    if (!stars || !text) return res.status(400).json({ error: "stars and text required" });
    var d = readReviews();
    d.reviews = d.reviews || [];
    d.reviews.push({
      id: "R" + Date.now() + Math.floor(Math.random() * 1000),
      stars: stars,
      name: String(b.name || "").trim().slice(0, 40) || "Customer",
      text: text,
      page: String(b.page || "").slice(0, 120),
      status: "pending",
      created: new Date().toISOString(),
    });
    writeReviews(d);
    res.json({ ok: true, status: "pending" });
  } catch (e) { res.status(500).json({ error: "fail" }); }
});
app.get("/api/reviews/admin", auth, function (req, res) { res.json(readReviews()); });
app.post("/api/reviews/moderate", auth, function (req, res) {
  var id = (req.body || {}).id;
  var status = (req.body || {}).status;
  if (!id || (status !== "approved" && status !== "rejected" && status !== "pending")) {
    return res.status(400).json({ error: "id and status required" });
  }
  var d = readReviews();
  var found = null;
  (d.reviews || []).forEach(function (r) {
    if (r.id === id) { r.status = status; found = r; }
  });
  if (!found) return res.status(404).json({ error: "not found" });
  writeReviews(d);
  res.json({ ok: true, review: found });
});
app.get("/login", function (req, res) {
  if (req.session.ok) return res.redirect("/admin");
  res.sendFile(path.join(__dirname, "admin", "login.html"));
});
app.post("/login", function (req, res) {
  if (req.body && req.body.password === PASS) { req.session.ok = true; return res.redirect("/admin"); }
  res.redirect("/login?err=1");
});
app.post("/logout", function (req, res) { req.session.destroy(function () { res.redirect("/login"); }); });
app.get("/admin", auth, function (req, res) { res.sendFile(path.join(__dirname, "admin", "index.html")); });
app.get("/admin/reviews", auth, function (req, res) { res.sendFile(path.join(__dirname, "admin", "reviews.html")); });
app.get("/api/inventory", auth, function (req, res) { res.json(read()); });
/** Big red switch — flips website inventory feed on/off */
app.post("/api/admin/public-feed", auth, function (req, res) {
  var d = read();
  if (typeof req.body.enabled === "boolean") d.publicFeed = req.body.enabled;
  else d.publicFeed = !d.publicFeed;
  write(d);
  res.json({ ok: true, publicFeed: d.publicFeed });
});
app.post("/api/inventory/adjust", auth, function (req, res) {
  var d = read(); var item = null;
  for (var i = 0; i < d.items.length; i++) if (d.items[i].sku === req.body.sku) item = d.items[i];
  if (!item) return res.status(404).json({ error: "not found" });
  item.qty = Math.max(0, (item.qty || 0) + Number(req.body.delta || 0));
  d.movements = d.movements || [];
  d.movements.unshift({ ts: new Date().toISOString(), sku: item.sku, delta: Number(req.body.delta), reason: "manual", qtyAfter: item.qty });
  write(d); res.json({ ok: true, item: publicItem(item) });
});
app.post("/api/inventory/item", auth, function (req, res) {
  var b = req.body || {};
  if (!b.sku || !b.name) return res.status(400).json({ error: "sku and name required" });
  var d = read(); var idx = -1;
  for (var i = 0; i < d.items.length; i++) if (d.items[i].sku === b.sku) idx = i;
  var row = {
    sku: String(b.sku).trim(), name: String(b.name).trim(), category: b.category || "Hardscape",
    description: b.description || "", price: Number(b.price) || 0, qty: Number(b.qty) || 0,
    reserved: Number(b.reserved) || 0, reorder: Number(b.reorder) || 0,
    lane: b.lane === "external" ? "external" : "direct", status: b.status || "active",
    image: b.image || "", location: b.location || "WH-A1", unit: b.unit || "each"
  };
  if (idx >= 0) { d.items[idx] = Object.assign({}, d.items[idx], row); row = d.items[idx]; }
  else d.items.push(row);
  write(d); res.json({ ok: true, item: publicItem(row) });
});
app.post("/api/inventory/image", auth, function (req, res) {
  try {
    var b = req.body || {};
    if (!b.sku || !b.dataUrl) return res.status(400).json({ error: "sku and dataUrl required" });
    var m = String(b.dataUrl).match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/);
    if (!m) return res.status(400).json({ error: "bad image data" });
    var ext = m[1] === "jpeg" ? "jpg" : m[1];
    var safe = String(b.sku).replace(/[^a-zA-Z0-9_-]/g, "_");
    var fname = safe + "-" + Date.now() + "." + ext;
    var buf = Buffer.from(m[2], "base64");
    if (buf.length > 1500000) return res.status(400).json({ error: "image too large" });
    fs.writeFileSync(path.join(UPLOADS, fname), buf);
    var url = "/uploads/" + fname;
    var d = read(); var item = null;
    for (var i = 0; i < d.items.length; i++) {
      if (d.items[i].sku === b.sku) { d.items[i].image = url; item = d.items[i]; }
    }
    if (!item) return res.status(404).json({ error: "save product first" });
    write(d);
    res.json({ ok: true, image: url });
  } catch (e) { res.status(500).json({ error: "upload failed" }); }
});
app.post("/api/webhook/sale", function (req, res) {
  var secret = req.headers["x-apex-secret"];
  if (process.env.WEBHOOK_SECRET && secret !== process.env.WEBHOOK_SECRET) return res.status(401).json({ error: "bad secret" });
  var sku = (req.body || {}).sku;
  var qty = Math.max(1, Number((req.body || {}).quantity) || 1);
  if (!sku) return res.status(400).json({ error: "sku required" });
  var result = decrementSku(sku, qty, "sale");
  if (!result.ok) return res.status(404).json(result);
  res.json(result);
});
app.post("/api/webhook/square", function (req, res) {
  try {
    var body = req.body || {};
    var type = body.type || "";
    var payment = body.data && body.data.object && (body.data.object.payment || body.data.object);
    if (type && type !== "payment.updated" && type !== "payment.created") return res.json({ ok: true, ignored: type });
    if (!payment) return res.json({ ok: true, ignored: "no payment" });
    if (payment.status && payment.status !== "COMPLETED") return res.json({ ok: true, ignored: "status " + payment.status });
    var lines = extractSkusFromSquarePayment(payment);
    if (!lines.length && process.env.SQUARE_DEFAULT_SKU) lines = [{ sku: process.env.SQUARE_DEFAULT_SKU, quantity: 1 }];
    var results = [];
    lines.forEach(function (line) { results.push(decrementSku(line.sku, line.quantity, "square")); });
    res.json({ ok: true, results: results });
  } catch (e) { res.status(500).json({ error: "webhook fail" }); }
});
app.post("/api/webhook/stripe", function (req, res) {
  try {
    var event = req.body || {};
    var type = event.type || "";
    if (type !== "payment_intent.succeeded" && type !== "checkout.session.completed") return res.json({ ok: true, ignored: type });
    var lines = extractSkusFromStripeEvent(event);
    if (!lines.length && process.env.STRIPE_DEFAULT_SKU) lines = [{ sku: process.env.STRIPE_DEFAULT_SKU, quantity: 1 }];
    var results = [];
    lines.forEach(function (line) { results.push(decrementSku(line.sku, line.quantity, "stripe")); });
    res.json({ ok: true, results: results });
  } catch (e) { res.status(500).json({ error: "webhook fail" }); }
});
app.post("/api/webhook/paypal", function (req, res) {
  try {
    var body = req.body || {};
    var et = String(body.event_type || "");
    if (et !== "PAYMENT.CAPTURE.COMPLETED" && et !== "CHECKOUT.ORDER.COMPLETED") return res.json({ ok: true, ignored: et });
    var lines = extractSkusFromPaypalEvent(body);
    if (!lines.length && process.env.PAYPAL_DEFAULT_SKU) lines = [{ sku: process.env.PAYPAL_DEFAULT_SKU, quantity: 1 }];
    var results = [];
    lines.forEach(function (line) { results.push(decrementSku(line.sku, line.quantity, "paypal")); });
    res.sendStatus(200);
  } catch (e) { res.status(500).json({ error: "webhook fail" }); }
});
app.get("/api/etsy/status", auth, function (req, res) {
  res.json({
    keystring: process.env.ETSY_KEYSTRING ? "set" : "missing",
    sharedSecret: process.env.ETSY_SHARED_SECRET ? "set" : "missing",
    shop: process.env.ETSY_SHOP_NAME || null,
    oauth: process.env.ETSY_ACCESS_TOKEN ? "authorized" : "needs-oauth",
  });
});
app.post("/api/webhook/etsy", function (req, res) {
  try {
    var body = req.body || {};
    var sku = body.sku || (body.data && body.data.sku);
    var qty = Number(body.quantity) || 1;
    if (sku) return res.json(decrementSku(sku, qty, "etsy"));
    res.json({ ok: true, ignored: "no sku" });
  } catch (e) { res.status(500).json({ error: "webhook fail" }); }
});
app.get("/", function (req, res) { res.redirect("/admin"); });
app.listen(PORT, function () {
  console.log("ApexFreePort on " + PORT);
  console.log("Square: " + (process.env.SQUARE_ACCESS_TOKEN ? "set" : "no"));
  try {
    var d = read();
    console.log("Public website feed: " + (d.publicFeed ? "ON" : "OFF (default)"));
  } catch (e) {}
});
