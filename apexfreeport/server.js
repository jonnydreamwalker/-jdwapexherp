const express = require("express");
const session = require("express-session");
const fs = require("fs");
const path = require("path");
const app = express();
const PORT = process.env.PORT || 3000;
const PASS = process.env.ADMIN_PASSWORD || "change-me-apex";
const DATA = path.join(__dirname, "data", "inventory.json");
const UPLOADS = path.join(__dirname, "data", "uploads");
if (!fs.existsSync(UPLOADS)) fs.mkdirSync(UPLOADS, { recursive: true });
app.use(function (req, res, next) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,x-apex-secret,x-square-hmacsha256-signature,x-square-signature");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: process.env.SESSION_SECRET || "apex-secret", resave: false, saveUninitialized: false }));
app.use("/uploads", express.static(UPLOADS));
function read() { return JSON.parse(fs.readFileSync(DATA, "utf8")); }
function write(d) { d.updated = new Date().toISOString(); fs.writeFileSync(DATA, JSON.stringify(d, null, 2)); }
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
function decrementSku(sku, qty, reason) {
  qty = Math.max(1, Number(qty) || 1);
  var d = read();
  var item = null;
  for (var i = 0; i < d.items.length; i++) if (d.items[i].sku === sku) item = d.items[i];
   if (!item) return { ok: false, error: "sku not found" sku: sku };
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
  var note = String(payment.note || payment.buyer_email_address || "");
  var ref = String(payment.reference_id || "");
  var blob = (note + " " + ref).toUpperCase();
  var d = read();
  (d.items || []).forEach(function (it) {
    if (blob.indexOf(String(it.sku).toUpperCase()) !== -1) {
      found.push({ sku: it.sku, quantity: 1 });
    }
  });
  if (payment.line_items && payment.line_items.length) {
    payment.line_items.forEach(function (li) {
      var name = String(li.name || li.uid || "");
      (d.items || []).forEach(function (it) {
        if (name.toUpperCase().indexOf(String(it.sku).toUpperCase()) !== -1 ||
            name.toUpperCase().indexOf(String(it.name).toUpperCase()) !== -1) {
          found.push({ sku: it.sku, quantity: Number(li.quantity) || 1 });
        }
      });
    });
  }
  return found;
}
app.get("/health", function (req, res) {
  res.json({
    ok: true,
    service: "ApexFreePort",
    square: process.env.SQUARE_ACCESS_TOKEN ? "token-set" : "no-token",
  });
});
app.get("/api/stock", function (req, res) {
  try {
    var d = read();
    res.json({ warehouse: d.warehouse, updated: d.updated, items: (d.items || []).map(publicItem) });
  } catch (e) { res.status(500).json({ error: "fail" }); }
});
app.get("/api/products", function (req, res) {
  try {
    var d = read();
    var items = (d.items || []).map(publicItem);
    if (req.query.category) {
      var cat = String(req.query.category).toLowerCase();
      items = items.filter(function (i) { return (i.category || "").toLowerCase() === cat; });
    }
    res.json({ warehouse: d.warehouse, updated: d.updated, items: items });
  } catch (e) { res.status(500).json({ error: "fail" }); }
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
app.get("/api/inventory", auth, function (req, res) { res.json(read()); });
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
/** Square: payment.updated — only act when COMPLETED; SKU from note/reference_id */
app.post("/api/webhook/square", function (req, res) {
  try {
    var body = req.body || {};
    var type = body.type || "";
    var payment = body.data && body.data.object && (body.data.object.payment || body.data.object);
    if (type && type !== "payment.updated" && type !== "payment.created") {
      return res.json({ ok: true, ignored: type });
    }
    if (!payment) return res.json({ ok: true, ignored: "no payment" });
    var status = payment.status || "";
    if (status && status !== "COMPLETED") {
      return res.json({ ok: true, ignored: "status " + status });
    }
    var lines = extractSkusFromSquarePayment(payment);
    if (!lines.length) {
      var fallback = process.env.SQUARE_DEFAULT_SKU;
      if (fallback) lines = [{ sku: fallback, quantity: 1 }];
    }
    var results = [];
    lines.forEach(function (line) {
      results.push(decrementSku(line.sku, line.quantity, "square"));
    });
    console.log("Square webhook", status, results);
    res.json({ ok: true, results: results });
  } catch (e) {
    console.error("Square webhook error", e);
    res.status(500).json({ error: "webhook fail" });
  }
});
app.get("/", function (req, res) { res.redirect("/admin"); });
app.listen(PORT, function () {
  console.log("ApexFreePort on " + PORT);
  if (process.env.SQUARE_ACCESS_TOKEN) console.log("Square token: set");
});
