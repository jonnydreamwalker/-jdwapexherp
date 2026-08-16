/**
 * ApexFreePort — Master cross-store cart
 * Shared cart for herp / k9 / feline storefronts.
 * Storage: data/carts.json
 *
 * GET    /api/cart/:id
 * POST   /api/cart                 { } -> create
 * POST   /api/cart/:id/items       { sku, name, price, quantity, store, preorder }
 * PUT    /api/cart/:id/items       { sku, quantity }  (set qty; 0 removes)
 * DELETE /api/cart/:id/items/:sku
 * POST   /api/cart/:id/clear
 * POST   /api/cart/:id/merge       { items: [...] }  (import local lines)
 */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const CARTS = path.join(__dirname, "data", "carts.json");
const MAX_LINES = 80;
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

function ensureFile() {
  const dir = path.dirname(CARTS);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(CARTS)) {
    fs.writeFileSync(CARTS, JSON.stringify({ updated: new Date().toISOString(), carts: {} }));
  }
}

function readAll() {
  ensureFile();
  try {
    const d = JSON.parse(fs.readFileSync(CARTS, "utf8"));
    if (!d.carts || typeof d.carts !== "object") d.carts = {};
    return d;
  } catch (e) {
    return { updated: new Date().toISOString(), carts: {} };
  }
}

function writeAll(d) {
  d.updated = new Date().toISOString();
  const tmp = CARTS + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(d));
  fs.renameSync(tmp, CARTS);
}

function newId() {
  return "c_" + crypto.randomBytes(12).toString("hex");
}

function emptyCart(id) {
  return {
    id: id,
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    items: []
  };
}

function publicCart(c) {
  const items = (c.items || []).map(function (it) {
    return {
      sku: it.sku,
      name: it.name,
      price: Number(it.price) || 0,
      quantity: Number(it.quantity) || 1,
      store: it.store || "herp",
      preorder: !!it.preorder
    };
  });
  const count = items.reduce(function (n, it) {
    return n + (Number(it.quantity) || 0);
  }, 0);
  const subtotal = items.reduce(function (s, it) {
    return s + (Number(it.price) || 0) * (Number(it.quantity) || 0);
  }, 0);
  return {
    ok: true,
    id: c.id,
    items: items,
    count: count,
    subtotal: Math.round(subtotal * 100) / 100,
    updated: c.updated
  };
}

function touch(c) {
  c.updated = new Date().toISOString();
  return c;
}

function purgeStale(d) {
  const now = Date.now();
  Object.keys(d.carts).forEach(function (id) {
    const c = d.carts[id];
    const t = Date.parse(c && c.updated ? c.updated : 0) || 0;
    if (!c || now - t > TTL_MS) delete d.carts[id];
  });
}

function normalizeLine(raw) {
  const sku = String((raw && raw.sku) || "").trim();
  if (!sku) return null;
  const quantity = Math.max(1, Math.min(999, Number(raw.quantity) || 1));
  const price = Math.max(0, Number(raw.price) || 0);
  if (price <= 0) return null;
  const store = String((raw && raw.store) || "herp").toLowerCase();
  const safeStore = store === "k9" || store === "feline" ? store : "herp";
  return {
    sku: sku,
    name: String((raw && raw.name) || sku).slice(0, 200),
    price: price,
    quantity: quantity,
    store: safeStore,
    preorder: !!(raw && raw.preorder)
  };
}

function getOrCreate(d, id) {
  if (id && d.carts[id]) return d.carts[id];
  const nid = id && /^c_[a-f0-9]{16,}$/i.test(id) ? id : newId();
  if (!d.carts[nid]) d.carts[nid] = emptyCart(nid);
  return d.carts[nid];
}

module.exports = function mountCart(app) {
  ensureFile();

  app.use(function (req, res, next) {
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  app.post("/api/cart", function (req, res) {
    try {
      const d = readAll();
      purgeStale(d);
      const c = emptyCart(newId());
      d.carts[c.id] = c;
      writeAll(d);
      res.json(publicCart(c));
    } catch (e) {
      res.status(500).json({ error: "cart_create_failed", message: e.message });
    }
  });

  app.get("/api/cart/:id", function (req, res) {
    try {
      const d = readAll();
      const c = d.carts[req.params.id];
      if (!c) return res.status(404).json({ error: "not_found" });
      res.json(publicCart(c));
    } catch (e) {
      res.status(500).json({ error: "cart_read_failed" });
    }
  });

  app.post("/api/cart/:id/items", function (req, res) {
    try {
      const d = readAll();
      const c = getOrCreate(d, req.params.id);
      const line = normalizeLine(req.body || {});
      if (!line) return res.status(400).json({ error: "invalid_item" });
      let found = null;
      (c.items || []).forEach(function (it) {
        if (it.sku === line.sku && (it.store || "herp") === line.store) found = it;
      });
      if (found) {
        found.quantity = Math.min(999, (Number(found.quantity) || 0) + line.quantity);
        found.price = line.price;
        found.name = line.name;
        found.preorder = line.preorder;
      } else {
        if ((c.items || []).length >= MAX_LINES) {
          return res.status(400).json({ error: "cart_full" });
        }
        c.items = c.items || [];
        c.items.push(line);
      }
      touch(c);
      d.carts[c.id] = c;
      writeAll(d);
      res.json(publicCart(c));
    } catch (e) {
      res.status(500).json({ error: "cart_add_failed", message: e.message });
    }
  });

  app.put("/api/cart/:id/items", function (req, res) {
    try {
      const d = readAll();
      const c = d.carts[req.params.id];
      if (!c) return res.status(404).json({ error: "not_found" });
      const sku = String((req.body && req.body.sku) || "").trim();
      const hasStore = !!(req.body && req.body.store);
      const store = String((req.body && req.body.store) || "herp").toLowerCase();
      const qty = Number(req.body && req.body.quantity);
      if (!sku) return res.status(400).json({ error: "sku required" });
      const next = [];
      (c.items || []).forEach(function (it) {
        const match = it.sku === sku && (!hasStore || (it.store || "herp") === store);
        if (!match) {
          next.push(it);
          return;
        }
        if (!isNaN(qty) && qty <= 0) return;
        if (!isNaN(qty) && qty > 0) it.quantity = Math.min(999, qty);
        next.push(it);
      });
      c.items = next;
      touch(c);
      writeAll(d);
      res.json(publicCart(c));
    } catch (e) {
      res.status(500).json({ error: "cart_update_failed" });
    }
  });

  app.delete("/api/cart/:id/items/:sku", function (req, res) {
    try {
      const d = readAll();
      const c = d.carts[req.params.id];
      if (!c) return res.status(404).json({ error: "not_found" });
      const sku = decodeURIComponent(req.params.sku);
      const store = (req.query.store || "").toLowerCase();
      c.items = (c.items || []).filter(function (it) {
        if (it.sku !== sku) return true;
        if (store && (it.store || "herp") !== store) return true;
        return false;
      });
      touch(c);
      writeAll(d);
      res.json(publicCart(c));
    } catch (e) {
      res.status(500).json({ error: "cart_remove_failed" });
    }
  });

  app.post("/api/cart/:id/clear", function (req, res) {
    try {
      const d = readAll();
      const c = d.carts[req.params.id];
      if (!c) return res.status(404).json({ error: "not_found" });
      c.items = [];
      touch(c);
      writeAll(d);
      res.json(publicCart(c));
    } catch (e) {
      res.status(500).json({ error: "cart_clear_failed" });
    }
  });

  app.post("/api/cart/:id/merge", function (req, res) {
    try {
      const d = readAll();
      const c = getOrCreate(d, req.params.id);
      const incoming = Array.isArray(req.body && req.body.items) ? req.body.items : [];
      incoming.forEach(function (raw) {
        const line = normalizeLine(raw);
        if (!line) return;
        let found = null;
        (c.items || []).forEach(function (it) {
          if (it.sku === line.sku && (it.store || "herp") === line.store) found = it;
        });
        if (found) {
          found.quantity = Math.min(999, (Number(found.quantity) || 0) + line.quantity);
          found.price = line.price;
          found.name = line.name;
        } else if ((c.items || []).length < MAX_LINES) {
          c.items = c.items || [];
          c.items.push(line);
        }
      });
      touch(c);
      d.carts[c.id] = c;
      writeAll(d);
      res.json(publicCart(c));
    } catch (e) {
      res.status(500).json({ error: "cart_merge_failed" });
    }
  });

  console.log("Cart routes: mounted (master cross-store cart)");
};
