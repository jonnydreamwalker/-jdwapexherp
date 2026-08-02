/**
 * Checkout: Stripe + Square + PayPal
 * POST /api/checkout/stripe|square|paypal
 * GET  /api/checkout/status
 * POST /api/webhook/stripe | /api/webhook/paypal
 * POST /api/checkout/shipping-quote
 * SKU shipping: [PREFIX]-[WEIGHT]-[BOX|UNS]-[QTY]-[MAT]-[SUFFIX]
 */
const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = path.join(__dirname, "data");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");
const PENDING_DIR = path.join(DATA_DIR, "pending-checkout");
const INVENTORY_FILE = path.join(DATA_DIR, "inventory.json");

function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(PENDING_DIR)) fs.mkdirSync(PENDING_DIR, { recursive: true });
}

function postForm(hostname, pathName, headers, body) {
  return new Promise(function (resolve, reject) {
    const data = typeof body === "string" ? body : JSON.stringify(body);
    const req = https.request(
      { hostname: hostname, path: pathName, method: "POST",
        headers: Object.assign({ "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) }, headers) },
      function (res) {
        let raw = "";
        res.on("data", function (c) { raw += c; });
        res.on("end", function () {
          let json = null;
          try { json = JSON.parse(raw); } catch (e) { json = { raw: raw }; }
          resolve({ status: res.statusCode, body: json });
        });
      }
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

function getHttps(hostname, pathName, headers) {
  return new Promise(function (resolve, reject) {
    const req = https.request({ hostname: hostname, path: pathName, method: "GET", headers: headers || {} }, function (res) {
      let raw = "";
      res.on("data", function (c) { raw += c; });
      res.on("end", function () {
        let json = null;
        try { json = JSON.parse(raw); } catch (e) { json = { raw: raw }; }
        resolve({ status: res.statusCode, body: json });
      });
    });
    req.on("error", reject);
    req.end();
  });
}

var UPS_DIM_DIVISOR = 139;

function cartSubtotal(items) {
  return (items || []).reduce(function (s, it) {
    return s + (Number(it.price) || 0) * (Number(it.quantity) || 1);
  }, 0);
}

function parseSku(sku) {
  var raw = String(sku || "").trim().toUpperCase();
  var segs = raw.split("-").filter(Boolean);
  var out = {
    sku: raw,
    prefix: segs[0] || "",
    weightLbs: null,
    boxCode: null,
    dims: null,
    unspec: false,
    packQty: 1,
    material: segs[4] || "",
    bulk: false,
    fobOrigin: false
  };
  if (segs.length >= 2) {
    var w = parseFloat(segs[1]);
    if (!isNaN(w) && w > 0) out.weightLbs = w;
  }
  if (segs.length >= 3) {
    var box = segs[2];
    out.boxCode = box;
    if (box === "UNS") {
      out.unspec = true;
    } else if (/^\d{6}$/.test(box)) {
      out.dims = {
        w: parseInt(box.slice(0, 2), 10),
        l: parseInt(box.slice(2, 4), 10),
        h: parseInt(box.slice(4, 6), 10)
      };
    }
  }
  if (segs.length >= 4) {
    var pq = parseInt(segs[3], 10);
    if (!isNaN(pq) && pq > 0) out.packQty = pq;
  }
  if (segs.length && segs[segs.length - 1] === "B") {
    out.bulk = true;
    out.fobOrigin = true;
  }
  return out;
}

function dimWeightLbs(dims) {
  if (!dims) return 0;
  var w = Number(dims.w) || 0;
  var l = Number(dims.l) || 0;
  var h = Number(dims.h) || 0;
  if (w <= 0 || l <= 0 || h <= 0) return 0;
  return Math.ceil((w * l * h) / UPS_DIM_DIVISOR);
}

function unitBillableLbs(it) {
  var meta = parseSku(it && it.sku);
  var actual = Number(it && (it.weightLbs != null ? it.weightLbs : it.weight));
  if (!(actual > 0) && meta.weightLbs != null) actual = meta.weightLbs;
  if (!(actual > 0)) {
    var sku = String((it && it.sku) || "").toUpperCase();
    var name = String((it && it.name) || "").toLowerCase();
    if (sku.indexOf("HS-") === 0 || name.indexOf("cork") >= 0 || name.indexOf("hardscape") >= 0) actual = 2.5;
    else if (sku.indexOf("SB-") === 0 || name.indexOf("substrate") >= 0 || name.indexOf("coco") >= 0) actual = 3.0;
    else if (sku.indexOf("LT-") === 0 || name.indexOf("uvb") >= 0 || name.indexOf("bulb") >= 0) actual = 0.8;
    else if (sku.indexOf("AP-") === 0 || name.indexOf("tee") >= 0 || name.indexOf("apparel") >= 0) actual = 0.5;
    else if (sku.indexOf("NT-") === 0 || name.indexOf("diet") >= 0 || name.indexOf("calcium") >= 0) actual = 0.6;
    else actual = 1.0;
  }
  if (meta.unspec || !meta.dims) {
    return { lbs: actual, meta: meta, dimLbs: 0, actualLbs: actual };
  }
  var dimLbs = dimWeightLbs(meta.dims);
  return { lbs: Math.max(actual, dimLbs), meta: meta, dimLbs: dimLbs, actualLbs: actual };
}

function defaultWeightLbs(it) {
  return unitBillableLbs(it).lbs;
}

function cartWeightLbs(items) {
  return (items || []).reduce(function (s, it) {
    var u = unitBillableLbs(it);
    var qty = Number(it.quantity) || 1;
    return s + u.lbs * qty * (u.meta.packQty || 1);
  }, 0);
}

function rateMultiplierFromSkus(items) {
  return (items || []).reduce(function (s, it) {
    var meta = parseSku(it.sku);
    var qty = Number(it.quantity) || 1;
    return s + meta.packQty * qty;
  }, 0) || 1;
}

function upsConfigured() {
  return !!(process.env.UPS_CLIENT_ID && process.env.UPS_CLIENT_SECRET && process.env.UPS_ACCOUNT_NUMBER);
}

function fallbackUpsGround(weightLbs, destZip) {
  var w = Math.max(1, Number(weightLbs) || 1);
  var base = 9.25;
  var perLb = w <= 10 ? 0.95 : 0.75;
  var zoneBump = 0;
  var z = String(destZip || "").replace(/\D/g, "").slice(0, 3);
  if (z) {
    var n = parseInt(z, 10);
    if (n >= 900 || (n >= 10 && n < 200)) zoneBump = 4.5;
    else if (n >= 800 || n < 300) zoneBump = 2.5;
    else if (n >= 700) zoneBump = 1.5;
  }
  return Math.round(Math.max(12, base + perLb * w + zoneBump) * 100) / 100;
}

function upsToken() {
  return new Promise(function (resolve, reject) {
    var id = process.env.UPS_CLIENT_ID;
    var secret = process.env.UPS_CLIENT_SECRET;
    var data = "grant_type=client_credentials";
    var auth = Buffer.from(id + ":" + secret).toString("base64");
    var host = process.env.UPS_API_HOST || "onlinetools.ups.com";
    var req = https.request({
      hostname: host, path: "/security/v1/oauth/token", method: "POST",
      headers: {
        Authorization: "Basic " + auth,
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(data),
        "x-merchant-id": process.env.UPS_ACCOUNT_NUMBER || ""
      }
    }, function (res) {
      var raw = "";
      res.on("data", function (c) { raw += c; });
      res.on("end", function () {
        try { resolve(JSON.parse(raw)); } catch (e) { resolve({ raw: raw }); }
      });
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

function buildUpsPackages(items) {
  var packages = [];
  (items || []).forEach(function (it) {
    var u = unitBillableLbs(it);
    var qty = Number(it.quantity) || 1;
    var packs = Math.max(1, (u.meta.packQty || 1) * qty);
    var wEach = Math.max(1, Math.ceil(u.lbs));
    for (var i = 0; i < packs; i++) {
      var pkg = {
        PackagingType: { Code: "02", Description: "Package" },
        PackageWeight: { UnitOfMeasurement: { Code: "LBS" }, Weight: String(wEach) }
      };
      if (u.meta.dims && !u.meta.unspec) {
        pkg.Dimensions = {
          UnitOfMeasurement: { Code: "IN" },
          Length: String(u.meta.dims.l),
          Width: String(u.meta.dims.w),
          Height: String(u.meta.dims.h)
        };
      }
      packages.push(pkg);
    }
  });
  if (!packages.length) {
    packages.push({
      PackagingType: { Code: "02", Description: "Package" },
      PackageWeight: { UnitOfMeasurement: { Code: "LBS" }, Weight: "1" }
    });
  }
  return packages;
}

function fetchUpsGroundRate(weightLbs, destZip, items) {
  return upsToken().then(function (tok) {
    if (!tok || !tok.access_token) return Promise.reject(new Error("ups_auth"));
    var access = tok.access_token;
    var shipperZip = process.env.UPS_SHIPPER_ZIP || "32433";
    var host = process.env.UPS_API_HOST || "onlinetools.ups.com";
    var packages = items && items.length ? buildUpsPackages(items) : [{
      PackagingType: { Code: "02", Description: "Package" },
      PackageWeight: { UnitOfMeasurement: { Code: "LBS" }, Weight: String(Math.max(1, Math.ceil(Number(weightLbs) || 1))) }
    }];
    var body = JSON.stringify({
      RateRequest: {
        Request: { RequestOption: "Rate" },
        Shipment: {
          Shipper: {
            Name: "JDW Apex FreePort",
            ShipperNumber: process.env.UPS_ACCOUNT_NUMBER,
            Address: { PostalCode: shipperZip, CountryCode: "US" }
          },
          ShipTo: { Address: { PostalCode: String(destZip).replace(/\D/g, "").slice(0, 5), CountryCode: "US" } },
          ShipFrom: { Address: { PostalCode: shipperZip, CountryCode: "US" } },
          Service: { Code: "03", Description: "UPS Ground" },
          Package: packages
        }
      }
    });
    return new Promise(function (resolve, reject) {
      var req = https.request({
        hostname: host, path: "/api/rating/v1/Rate", method: "POST",
        headers: {
          Authorization: "Bearer " + access,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          transId: "fp-" + Date.now(),
          transactionSrc: "ApexFreePort"
        }
      }, function (res) {
        var raw = "";
        res.on("data", function (c) { raw += c; });
        res.on("end", function () {
          try {
            var j = JSON.parse(raw);
            var rated = j.RateResponse && j.RateResponse.RatedShipment && j.RateResponse.RatedShipment[0];
            var total = rated && rated.TotalCharges && rated.TotalCharges.MonetaryValue;
            if (total) resolve(Math.round(parseFloat(total) * 100) / 100);
            else reject(new Error("ups_no_rate"));
          } catch (e) { reject(e); }
        });
      });
      req.on("error", reject);
      req.write(body);
      req.end();
    });
  });
}

async function quoteShipping(items, destZip) {
  var subtotal = Math.round(cartSubtotal(items) * 100) / 100;
  var weight = Math.round(cartWeightLbs(items) * 100) / 100;
  var HANDLING = 5.0;
  var under40 = 6.5;
  var mid = 7.95;
  var packFactor = rateMultiplierFromSkus(items);
  var bulkLines = (items || []).filter(function (it) { return parseSku(it.sku).fobOrigin; });
  var hasBulk = bulkLines.length > 0;

  if (hasBulk && bulkLines.length === (items || []).length) {
    return {
      amount: 0, method: "fob_origin",
      label: "FOB Origin — freight invoiced separately (Bulk)",
      tier: "bulk_fob", weightLbs: weight, subtotal: subtotal, handling: 0,
      bulk: true, fobOrigin: true, packQtyTotal: packFactor
    };
  }
  if (subtotal < 40 && weight <= 10 && !hasBulk) {
    return { amount: under40, method: "flat", label: "Standard shipping", tier: "under40", weightLbs: weight, subtotal: subtotal, handling: 0, packQtyTotal: packFactor };
  }
  if (subtotal < 75 && weight <= 10 && !hasBulk) {
    return { amount: mid, method: "flat", label: "Standard shipping", tier: "mid40to75", weightLbs: weight, subtotal: subtotal, handling: 0, packQtyTotal: packFactor };
  }

  var upsRate = null;
  var source = "estimated_ups";
  var zip = destZip && String(destZip).replace(/\D/g, "").slice(0, 5);
  if (zip && zip.length >= 5 && upsConfigured()) {
    try {
      upsRate = await fetchUpsGroundRate(weight, zip, items);
      source = "ups_ground";
    } catch (e) { console.error("UPS rate error:", e.message); }
  }
  if (upsRate == null) {
    upsRate = fallbackUpsGround(weight, zip);
    source = "estimated_ups";
  }
  var amount = Math.round((Number(upsRate) + HANDLING) * 100) / 100;
  return {
    amount: amount, method: source,
    label: hasBulk ? "UPS Ground + handling (non-bulk lines; bulk FOB separate)" : "UPS Ground + handling",
    tier: "heavy_or_over75",
    upsGround: Math.round(Number(upsRate) * 100) / 100,
    handling: HANDLING, weightLbs: weight, subtotal: subtotal,
    bulk: hasBulk, fobOrigin: hasBulk, packQtyTotal: packFactor
  };
}

function squareHost() {
  const env = String(process.env.SQUARE_ENV || "").toLowerCase();
  if (env === "production" || env === "prod" || process.env.SQUARE_FORCE_PROD === "1") return "connect.squareup.com";
  return "connect.squareupsandbox.com";
}
function paypalHost() {
  const mode = String(process.env.PAYPAL_MODE || "sandbox").toLowerCase();
  if (mode === "live" || mode === "production") return "api-m.paypal.com";
  return "api-m.sandbox.paypal.com";
}
function savePending(id, payload) {
  ensureDirs();
  const safe = String(id || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
  if (!safe) return;
  fs.writeFileSync(path.join(PENDING_DIR, safe + ".json"), JSON.stringify(payload, null, 2));
}
function loadPending(id) {
  const safe = String(id || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
  if (!safe) return null;
  const f = path.join(PENDING_DIR, safe + ".json");
  try { if (!fs.existsSync(f)) return null; return JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { return null; }
}
function clearPending(id) {
  const safe = String(id || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
  if (!safe) return;
  try { fs.unlinkSync(path.join(PENDING_DIR, safe + ".json")); } catch (e) {}
}
function readOrders() {
  ensureDirs();
  try {
    if (!fs.existsSync(ORDERS_FILE)) {
      const d = { updated: new Date().toISOString(), warehouse: { name: "JDW Apex FreePort", state: "FL" }, orders: [] };
      fs.writeFileSync(ORDERS_FILE, JSON.stringify(d, null, 2));
      return d;
    }
    return JSON.parse(fs.readFileSync(ORDERS_FILE, "utf8"));
  } catch (e) {
    return { updated: new Date().toISOString(), warehouse: { name: "JDW Apex FreePort", state: "FL" }, orders: [] };
  }
}
function writeOrders(data) {
  ensureDirs();
  data.updated = new Date().toISOString();
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(data, null, 2));
}
function appendOrder(order) {
  const data = readOrders();
  if (!Array.isArray(data.orders)) data.orders = [];
  data.orders.unshift(order);
  writeOrders(data);
  return order;
}
function normalizeItems(raw) {
  return (raw || []).map(function (it) {
    return {
      name: String(it.name || it.sku || "Item"),
      sku: String(it.sku || ""),
      price: Number(it.price) || 0,
      quantity: Number(it.quantity) || 1,
      weightLbs: it.weightLbs != null ? Number(it.weightLbs) : (it.weight != null ? Number(it.weight) : null),
      dropShip: !!it.dropShip,
      supplier: it.supplier || "",
      shippingTerms: it.shippingTerms || ""
    };
  }).filter(function (it) { return it.price > 0 && it.quantity > 0; });
}
function shipToFromStripeSession(session) {
  const d = (session && session.customer_details) || {};
  const a = d.address || {};
  return {
    name: String(d.name || ""),
    line1: String(a.line1 || ""), line2: String(a.line2 || ""),
    city: String(a.city || ""), state: String(a.state || ""),
    zip: String(a.postal_code || ""), country: String(a.country || "US")
  };
}
function shipToFromPaypal(resource) {
  const ship = (resource && resource.shipping) || {};
  const a = ship.address || {};
  const name = (ship.name && (ship.name.full_name || [ship.name.given_name, ship.name.surname].filter(Boolean).join(" "))) || "";
  return {
    name: String(name),
    line1: String(a.address_line_1 || ""), line2: String(a.address_line_2 || ""),
    city: String(a.admin_area_2 || ""), state: String(a.admin_area_1 || ""),
    zip: String(a.postal_code || ""), country: String(a.country_code || "US")
  };
}

module.exports = function mountCheckout(app) {
  app.get("/api/checkout/status", function (req, res) {
    res.json({
      ok: true,
      stripe: process.env.STRIPE_SECRET_KEY ? "token-set" : "no-token",
      paypal: process.env.PAYPAL_CLIENT_ID ? "client-set" : "no-client",
      square: process.env.SQUARE_ACCESS_TOKEN ? "token-set" : "no-token",
      paypalMode: process.env.PAYPAL_MODE || "sandbox",
      shipping: "sku-engine"
    });
  });

  app.post("/api/checkout/shipping-quote", async function (req, res) {
    try {
      const items = normalizeItems((req.body && req.body.items) || []);
      const zip = (req.body && (req.body.zip || req.body.destZip)) || "";
      const quote = await quoteShipping(items, zip);
      res.json({ ok: true, quote: quote });
    } catch (e) {
      console.error("shipping-quote", e);
      res.status(500).json({ error: "quote_failed", message: String(e.message || e) });
    }
  });

  app.post("/api/checkout/stripe", async function (req, res) {
    try {
      const key = process.env.STRIPE_SECRET_KEY;
      if (!key) return res.status(503).json({ error: "stripe_not_configured" });
      const items = normalizeItems((req.body && req.body.items) || []);
      if (!items.length) return res.status(400).json({ error: "empty_cart" });
      const successUrl = String((req.body && req.body.successUrl) || "https://jdwapexherp.com/?paid=1");
      const cancelUrl = String((req.body && req.body.cancelUrl) || "https://jdwapexherp.com/");
      const destZip = (req.body && req.body.zip) || "";
      const shipQuote = await quoteShipping(items, destZip);
      const line_items = items.map(function (it) {
        return {
          quantity: it.quantity,
          price_data: {
            currency: "usd",
            unit_amount: Math.round(it.price * 100),
            product_data: { name: it.name, metadata: { sku: it.sku || "" } }
          }
        };
      });
      if (shipQuote.amount > 0) {
        line_items.push({
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: Math.round(shipQuote.amount * 100),
            product_data: { name: shipQuote.label || "Shipping" }
          }
        });
      }
      const params = new URLSearchParams();
      params.append("mode", "payment");
      params.append("success_url", successUrl);
      params.append("cancel_url", cancelUrl);
      params.append("shipping_address_collection[allowed_countries][0]", "US");
      params.append("shipping_address_collection[allowed_countries][1]", "CA");
      line_items.forEach(function (li, i) {
        params.append("line_items[" + i + "][quantity]", String(li.quantity));
        params.append("line_items[" + i + "][price_data][currency]", li.price_data.currency);
        params.append("line_items[" + i + "][price_data][unit_amount]", String(li.price_data.unit_amount));
        params.append("line_items[" + i + "][price_data][product_data][name]", li.price_data.product_data.name);
        if (li.price_data.product_data.metadata && li.price_data.product_data.metadata.sku) {
          params.append("line_items[" + i + "][price_data][product_data][metadata][sku]", li.price_data.product_data.metadata.sku);
        }
      });
      const r = await postForm("api.stripe.com", "/v1/checkout/sessions", {
        Authorization: "Bearer " + key,
        "Content-Type": "application/x-www-form-urlencoded"
      }, params.toString());
      if (r.status >= 200 && r.status < 300 && r.body && r.body.url) {
        savePending(r.body.id, { items: items, shipQuote: shipQuote, channel: (req.body && req.body.channel) || "retail" });
        return res.json({ ok: true, url: r.body.url, id: r.body.id, mode: "live", shipping: shipQuote });
      }
      return res.status(502).json({ error: "stripe_session_failed", detail: r.body });
    } catch (e) {
      console.error("stripe checkout", e);
      res.status(500).json({ error: "stripe_error", message: String(e.message || e) });
    }
  });

  app.post("/api/checkout/paypal", async function (req, res) {
    try {
      const cid = process.env.PAYPAL_CLIENT_ID;
      const secret = process.env.PAYPAL_CLIENT_SECRET;
      if (!cid || !secret) return res.status(503).json({ error: "paypal_not_configured" });
      const items = normalizeItems((req.body && req.body.items) || []);
      if (!items.length) return res.status(400).json({ error: "empty_cart" });
      const successUrl = String((req.body && req.body.successUrl) || "https://jdwapexherp.com/?paid=1");
      const cancelUrl = String((req.body && req.body.cancelUrl) || "https://jdwapexherp.com/");
      const destZip = (req.body && req.body.zip) || "";
      const shipQuote = await quoteShipping(items, destZip);
      const itemTotal = items.reduce(function (s, it) { return s + it.price * it.quantity; }, 0);
      const shipAmt = Number(shipQuote.amount) || 0;
      const total = Math.round((itemTotal + shipAmt) * 100) / 100;
      const host = paypalHost();
      const basic = Buffer.from(cid + ":" + secret).toString("base64");
      const tok = await postForm(host, "/v1/oauth2/token", {
        Authorization: "Basic " + basic,
        "Content-Type": "application/x-www-form-urlencoded"
      }, "grant_type=client_credentials");
      if (!tok.body || !tok.body.access_token) {
        return res.status(502).json({ error: "paypal_auth_failed", detail: tok.body });
      }
      const orderBody = {
        intent: "CAPTURE",
        purchase_units: [{
          amount: {
            currency_code: "USD",
            value: total.toFixed(2),
            breakdown: {
              item_total: { currency_code: "USD", value: itemTotal.toFixed(2) },
              shipping: { currency_code: "USD", value: shipAmt.toFixed(2) }
            }
          },
          items: items.map(function (it) {
            return {
              name: String(it.name).slice(0, 127),
              sku: String(it.sku || "").slice(0, 127),
              unit_amount: { currency_code: "USD", value: Number(it.price).toFixed(2) },
              quantity: String(it.quantity)
            };
          })
        }],
        application_context: {
          return_url: successUrl,
          cancel_url: cancelUrl,
          shipping_preference: "GET_FROM_FILE",
          user_action: "PAY_NOW"
        }
      };
      const ord = await postForm(host, "/v2/checkout/orders", {
        Authorization: "Bearer " + tok.body.access_token,
        "Content-Type": "application/json"
      }, orderBody);
      const approve = ord.body && ord.body.links && ord.body.links.find(function (l) { return l.rel === "approve"; });
      if (ord.status >= 200 && ord.status < 300 && approve && approve.href) {
        savePending(ord.body.id, { items: items, shipQuote: shipQuote, channel: (req.body && req.body.channel) || "retail" });
        return res.json({ ok: true, url: approve.href, id: ord.body.id, mode: process.env.PAYPAL_MODE || "sandbox", shipping: shipQuote });
      }
      return res.status(502).json({ error: "paypal_order_failed", detail: ord.body });
    } catch (e) {
      console.error("paypal checkout", e);
      res.status(500).json({ error: "paypal_error", message: String(e.message || e) });
    }
  });

  app.post("/api/webhook/stripe", function (req, res) {
    res.json({ received: true });
    try {
      const event = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      if (!event || event.type !== "checkout.session.completed") return;
      const session = event.data && event.data.object;
      if (!session) return;
      const pending = loadPending(session.id) || {};
      const items = pending.items || [];
      const shipTo = shipToFromStripeSession(session);
      const email = (session.customer_details && session.customer_details.email) || "";
      const phone = (session.customer_details && session.customer_details.phone) || "";
      appendOrder({
        id: "STRIPE-" + session.id,
        createdAt: new Date().toISOString(),
        status: "paid",
        channel: pending.channel || "retail",
        provider: "stripe",
        items: items,
        shipTo: shipTo,
        customer: { name: shipTo.name, email: email, phone: phone },
        shipping: pending.shipQuote || null,
        total: session.amount_total != null ? session.amount_total / 100 : null
      });
      clearPending(session.id);
    } catch (e) { console.error("stripe webhook", e); }
  });

  app.post("/api/webhook/paypal", async function (req, res) {
    res.json({ received: true });
    try {
      const event = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      if (!event || event.event_type !== "PAYMENT.CAPTURE.COMPLETED") return;
      const resource = event.resource || {};
      const orderId = resource.supplementary_data && resource.supplementary_data.related_ids && resource.supplementary_data.related_ids.order_id;
      const pending = loadPending(orderId) || {};
      const items = pending.items || [];
      let shipTo = shipToFromPaypal(resource);
      appendOrder({
        id: "PAYPAL-" + (orderId || resource.id || Date.now()),
        createdAt: new Date().toISOString(),
        status: "paid",
        channel: pending.channel || "retail",
        provider: "paypal",
        items: items,
        shipTo: shipTo,
        customer: { name: shipTo.name, email: "" },
        shipping: pending.shipQuote || null,
        notes: ["PayPal PAYMENT.CAPTURE.COMPLETED"]
      });
      if (orderId) clearPending(orderId);
    } catch (e) { console.error("paypal webhook", e); }
  });

  console.log("Checkout routes: mounted (SKU shipping engine)");
};
