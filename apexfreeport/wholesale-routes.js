/**
 * ApexFreePort — Wholesale dealer applications + portal API
 * Mount: require("./wholesale-routes")(app, { auth, dataDir, readInventory, writeInventory });
 *
 * Dealer catalog mirrors FreePort admin Wholesale tab (same pool rules as admin/app.js).
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

module.exports = function mountWholesale(app, opts) {
  opts = opts || {};
  const auth = opts.auth;
  const dataDir = opts.dataDir || path.join(__dirname, "data");
  const APP_FILE = path.join(dataDir, "applications.json");
  const DEALER_FILE = path.join(dataDir, "dealers.json");
  const notifyEmail = process.env.WHOLESALE_NOTIFY_EMAIL || "jonnydreamwalker@gmail.com";
  const ADMIN_PASS = process.env.ADMIN_PASSWORD || "change-me-apex";
  const OWNER_EMAIL = String(process.env.OWNER_EMAIL || "jonnydreamwalker@gmail.com").toLowerCase();

  function ensure(file, fallback) {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(fallback, null, 2));
  }
  ensure(APP_FILE, { applications: [] });
  ensure(DEALER_FILE, { dealers: [] });

  function readApps() {
    return JSON.parse(fs.readFileSync(APP_FILE, "utf8"));
  }
  function writeApps(d) {
    fs.writeFileSync(APP_FILE, JSON.stringify(d, null, 2));
  }
  function readDealers() {
    return JSON.parse(fs.readFileSync(DEALER_FILE, "utf8"));
  }
  function writeDealers(d) {
    fs.writeFileSync(DEALER_FILE, JSON.stringify(d, null, 2));
  }

  function hashPass(password, salt) {
    salt = salt || crypto.randomBytes(16).toString("hex");
    const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
    return { salt: salt, hash: hash };
  }
  function verifyPass(password, salt, hash) {
    try {
      const h = crypto.scryptSync(String(password), salt, 64).toString("hex");
      return crypto.timingSafeEqual(Buffer.from(h, "hex"), Buffer.from(hash, "hex"));
    } catch (e) {
      return false;
    }
  }
  function token() {
    return crypto.randomBytes(24).toString("hex");
  }

  function isOwnerDealer(d) {
    if (!d) return false;
    if (d.id === "DLR-OWNER") return true;
    return String(d.email || "").toLowerCase() === OWNER_EMAIL;
  }

  function dealerFromToken(req) {
    const t = req.headers["x-dealer-token"] || (req.session && req.session.dealerToken);
    if (!t) return null;
    const db = readDealers();
    return (
      (db.dealers || []).find(function (d) {
        return d.status === "active" && d.sessionToken === t;
      }) || null
    );
  }

  function publicDealer(d) {
    return {
      id: d.id,
      email: d.email,
      business_name: d.business_name,
      contact_name: d.contact_name,
      status: d.status,
      owner: isOwnerDealer(d)
    };
  }

  function ensureOwnerDealer(email) {
    const db = readDealers();
    let d = (db.dealers || []).find(function (x) {
      return x.id === "DLR-OWNER" || x.email === (email || OWNER_EMAIL);
    });
    if (!d) {
      d = {
        id: "DLR-OWNER",
        email: email || OWNER_EMAIL,
        business_name: "JDW Apex Herp Supply",
        contact_name: "Jonathan Roberts",
        phone: "",
        website: "https://jdwapexherp.com",
        tax_id: "OWNER",
        status: "active",
        setupToken: null,
        created: new Date().toISOString(),
        passHash: null,
        passSalt: null,
        sessionToken: null
      };
      db.dealers = db.dealers || [];
      db.dealers.push(d);
    }
    d.status = "active";
    if (email) d.email = email;
    writeDealers(db);
    return d;
  }

  /**
   * Same pool logic as FreePort admin/app.js itemPool()
   * retail | wholesale | both
   */
  function itemPool(it) {
    if (!it) return "retail";
    var p = String(it.pool || it.channel || "").toLowerCase();
    if (p === "wholesale" || p === "dealer") return "wholesale";
    if (p === "both") return "both";
    var w = Number(it.weightLb) || 0;
    var n = String(it.name || "").toLowerCase();
    var m = n.match(/(\d+)\s*lb/);
    if (w >= 50 || (m && Number(m[1]) >= 50) || it.dealerEligible === true) return "wholesale";
    return "retail";
  }

  /** Same rule as FreePort Wholesale tab: pool wholesale OR both only */
  function isWholesaleTabItem(it) {
    var pool = itemPool(it);
    return pool === "wholesale" || pool === "both";
  }

  function flattenInventory(raw) {
    if (!raw || typeof raw !== "object") return { warehouse: "DeFuniak Springs, FL", updated: null, items: [] };
    if (raw.stores) {
      var herp = raw.stores.herp || {};
      var items = Array.isArray(herp.items) ? herp.items : [];
      if (!items.length) {
        items = [];
        Object.keys(raw.stores).forEach(function (sid) {
          var st = raw.stores[sid];
          if (st && Array.isArray(st.items)) {
            st.items.forEach(function (it) {
              items.push(it);
            });
          }
        });
      }
      return {
        warehouse: raw.warehouse || "DeFuniak Springs, FL",
        updated: raw.updated,
        items: items,
        publicFeed: !!(herp.publicFeed)
      };
    }
    return {
      warehouse: raw.warehouse || "DeFuniak Springs, FL",
      updated: raw.updated,
      items: Array.isArray(raw.items) ? raw.items : [],
      publicFeed: !!raw.publicFeed
    };
  }

  function loadInventory() {
    var raw;
    if (typeof opts.readInventory === "function") {
      raw = opts.readInventory();
    } else {
      var invPath = path.join(dataDir, "inventory.json");
      raw = JSON.parse(fs.readFileSync(invPath, "utf8"));
    }
    return flattenInventory(raw);
  }

  function notifyApplicationEmail(appRow) {
    var to = notifyEmail;
    var payload = {
      _subject: "New dealer application: " + appRow.business_name,
      _template: "table",
      _captcha: "false",
      id: appRow.id,
      business_name: appRow.business_name,
      contact_name: appRow.contact_name,
      email: appRow.email,
      phone: appRow.phone,
      tax_id: appRow.tax_id,
      resale_cert: appRow.resale_cert,
      business_type: appRow.business_type,
      website: appRow.website,
      city: appRow.city,
      state: appRow.state,
      message: appRow.message,
      review: "https://freeport.jdwapexherp.com/admin/dealers"
    };
    fetch("https://formsubmit.co/ajax/" + encodeURIComponent(to), {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload)
    })
      .then(function (r) {
        console.log("Wholesale apply email:", r.status, to);
      })
      .catch(function (e) {
        console.log("Wholesale apply email failed:", e.message);
      });
  }

  app.post("/api/wholesale/apply", function (req, res) {
    try {
      const b = req.body || {};
      if (!b.business_name || !b.contact_name || !b.email || !b.tax_id || !b.website) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      const db = readApps();
      const appRow = {
        id: "APP-" + Date.now().toString(36).toUpperCase(),
        submitted: new Date().toISOString(),
        status: "pending",
        business_name: String(b.business_name).trim(),
        contact_name: String(b.contact_name).trim(),
        email: String(b.email).trim().toLowerCase(),
        phone: String(b.phone || "").trim(),
        tax_id: String(b.tax_id).trim(),
        resale_cert: String(b.resale_cert || "").trim(),
        business_type: String(b.business_type || "").trim(),
        address: String(b.address || "").trim(),
        city: String(b.city || "").trim(),
        state: String(b.state || "").trim(),
        zip: String(b.zip || "").trim(),
        website: String(b.website || "").trim(),
        instagram: String(b.instagram || "").trim(),
        social: String(b.social || "").trim(),
        years_in_business: String(b.years_in_business || "").trim(),
        monthly_volume: String(b.monthly_volume || "").trim(),
        interests: Array.isArray(b.interests) ? b.interests : [],
        message: String(b.message || "").trim(),
        notifyEmail: notifyEmail
      };
      db.applications = db.applications || [];
      db.applications.unshift(appRow);
      writeApps(db);
      console.log("Wholesale application:", appRow.id, appRow.business_name, "→", notifyEmail);
      notifyApplicationEmail(appRow);
      res.json({ ok: true, id: appRow.id, message: "Application received" });
    } catch (e) {
      res.status(500).json({ error: "Failed to save application" });
    }
  });

  app.get("/api/wholesale/applications", auth, function (req, res) {
    const db = readApps();
    res.json({ applications: db.applications || [] });
  });

  app.get("/api/wholesale/dealers", auth, function (req, res) {
    const db = readDealers();
    const list = (db.dealers || []).map(function (d) {
      return {
        id: d.id,
        email: d.email,
        business_name: d.business_name,
        contact_name: d.contact_name,
        status: d.status,
        website: d.website,
        created: d.created,
        hasPassword: !!(d.passHash && d.passSalt),
        owner: isOwnerDealer(d)
      };
    });
    res.json({ dealers: list });
  });

  app.post("/api/wholesale/applications/:id/decide", auth, function (req, res) {
    try {
      const decision = (req.body && req.body.decision) || "";
      const apps = readApps();
      const row = (apps.applications || []).find(function (a) {
        return a.id === req.params.id;
      });
      if (!row) return res.status(404).json({ error: "Not found" });

      if (decision === "reject") {
        row.status = "rejected";
        row.decided = new Date().toISOString();
        writeApps(apps);
        return res.json({ ok: true, status: "rejected" });
      }
      if (decision !== "approve") {
        return res.status(400).json({ error: "decision must be approve or reject" });
      }

      row.status = "approved";
      row.decided = new Date().toISOString();
      writeApps(apps);

      const dealers = readDealers();
      let existing = (dealers.dealers || []).find(function (d) {
        return d.email === row.email;
      });
      const setupToken = token();
      if (existing) {
        existing.status = "pending_setup";
        existing.setupToken = setupToken;
        existing.business_name = row.business_name;
        existing.contact_name = row.contact_name;
        existing.website = row.website;
        existing.tax_id = row.tax_id;
      } else {
        existing = {
          id: "DLR-" + Date.now().toString(36).toUpperCase(),
          email: row.email,
          business_name: row.business_name,
          contact_name: row.contact_name,
          phone: row.phone,
          website: row.website,
          tax_id: row.tax_id,
          status: "pending_setup",
          setupToken: setupToken,
          created: new Date().toISOString(),
          passHash: null,
          passSalt: null,
          sessionToken: null
        };
        dealers.dealers = dealers.dealers || [];
        dealers.dealers.push(existing);
      }
      writeDealers(dealers);

      const setupUrl =
        (process.env.WHOLESALE_PORTAL_URL || "https://jdwapexherp.com/wholesale") +
        "/setup.html?token=" +
        setupToken;

      res.json({
        ok: true,
        status: "approved",
        dealerId: existing.id,
        setupToken: setupToken,
        setupUrl: setupUrl,
        note: "Send setupUrl to dealer so they set their own password"
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/wholesale/setup-password", function (req, res) {
    const t = req.body && req.body.token;
    const password = req.body && req.body.password;
    if (!t || !password || String(password).length < 8) {
      return res.status(400).json({ error: "Token and password (8+ chars) required" });
    }
    const db = readDealers();
    const d = (db.dealers || []).find(function (x) {
      return x.setupToken === t;
    });
    if (!d) return res.status(400).json({ error: "Invalid or expired invite token" });
    const hp = hashPass(password);
    d.passSalt = hp.salt;
    d.passHash = hp.hash;
    d.setupToken = null;
    d.status = "active";
    d.passwordSet = new Date().toISOString();
    writeDealers(db);
    res.json({ ok: true, message: "Password set — you can log in" });
  });

  app.post("/api/wholesale/login", function (req, res) {
    const email = String((req.body && req.body.email) || "")
      .trim()
      .toLowerCase();
    const password = (req.body && req.body.password) || "";

    if (password && password === ADMIN_PASS) {
      const d = ensureOwnerDealer(email || OWNER_EMAIL);
      d.sessionToken = token();
      d.lastLogin = new Date().toISOString();
      const db = readDealers();
      const hit = (db.dealers || []).find(function (x) {
        return x.id === d.id;
      });
      if (hit) {
        hit.sessionToken = d.sessionToken;
        hit.lastLogin = d.lastLogin;
        hit.status = "active";
        writeDealers(db);
      }
      if (req.session) req.session.dealerToken = d.sessionToken;
      return res.json({ ok: true, token: d.sessionToken, dealer: publicDealer(d) });
    }

    const db = readDealers();
    const d = (db.dealers || []).find(function (x) {
      return x.email === email;
    });
    if (!d || d.status !== "active" || !d.passHash) {
      return res.status(401).json({ error: "Invalid email or password" });
    }
    if (!verifyPass(password, d.passSalt, d.passHash)) {
      return res.status(401).json({ error: "Invalid email or password" });
    }
    d.sessionToken = token();
    d.lastLogin = new Date().toISOString();
    writeDealers(db);
    if (req.session) req.session.dealerToken = d.sessionToken;
    res.json({ ok: true, token: d.sessionToken, dealer: publicDealer(d) });
  });

  app.post("/api/wholesale/logout", function (req, res) {
    const t = req.headers["x-dealer-token"] || (req.session && req.session.dealerToken);
    if (t) {
      const db = readDealers();
      const d = (db.dealers || []).find(function (x) {
        return x.sessionToken === t;
      });
      if (d) {
        d.sessionToken = null;
        writeDealers(db);
      }
    }
    if (req.session) req.session.dealerToken = null;
    res.json({ ok: true });
  });

  app.get("/api/wholesale/me", function (req, res) {
    const d = dealerFromToken(req);
    if (!d) return res.status(401).json({ error: "Unauthorized" });
    res.json({ dealer: publicDealer(d) });
  });

  /**
   * Dealer portal = ONLY what FreePort Wholesale tab shows.
   * Same filter as admin: pool wholesale OR both (not pure retail).
   */
  app.get("/api/wholesale/catalog", function (req, res) {
    const d = dealerFromToken(req);
    if (!d) return res.status(401).json({ error: "Unauthorized" });
    try {
      const inv = loadInventory();
      let items = inv.items || [];

      items = items.filter(function (i) {
        var st = String(i.status || "active").toLowerCase();
        return st !== "archived" && st !== "deleted";
      });

      // Strict: Wholesale tab only
      items = items.filter(isWholesaleTabItem);

      const cat = req.query.category;
      if (cat) {
        const c = String(cat).toLowerCase();
        items = items.filter(function (i) {
          return String(i.category || "").toLowerCase() === c;
        });
      }

      items = items.slice().sort(function (a, b) {
        return String(a.category || "").localeCompare(String(b.category || "")) ||
          String(a.name || "").localeCompare(String(b.name || ""));
      });

      const mapped = items.map(function (i) {
        const retail = Number(i.price) || 0;
        let dealer = i.dealerPrice != null ? Number(i.dealerPrice) : null;
        if (dealer == null || isNaN(dealer)) {
          dealer = Math.round(retail * 0.85 * 100) / 100;
        }
        return {
          sku: i.sku,
          name: i.name,
          category: i.category,
          description: i.description || "",
          image: i.image || (i.images && i.images[0]) || "",
          retailPrice: retail,
          dealerPrice: dealer,
          qty: i.qty,
          reserved: i.reserved,
          available: Math.max(0, (i.qty || 0) - (i.reserved || 0)),
          status: i.status,
          lane: i.lane,
          weightLb: i.weightLb || null,
          pool: itemPool(i),
          bulk: true
        };
      });

      res.json({
        warehouse: inv.warehouse || "DeFuniak Springs, FL",
        updated: inv.updated,
        dealer: publicDealer(d),
        mode: "wholesale-tab",
        count: mapped.length,
        items: mapped
      });
    } catch (e) {
      console.error("wholesale catalog", e.message);
      res.status(500).json({ error: "Catalog unavailable", detail: e.message });
    }
  });

  app.post("/api/wholesale/sku-price", auth, function (req, res) {
    try {
      const sku = req.body && req.body.sku;
      const dealerPrice = Number(req.body && req.body.dealerPrice);
      if (!sku || isNaN(dealerPrice)) return res.status(400).json({ error: "sku and dealerPrice required" });
      let inv = loadInventory();
      const item = (inv.items || []).find(function (i) {
        return i.sku === sku;
      });
      if (!item) return res.status(404).json({ error: "SKU not found" });
      item.dealerPrice = dealerPrice;
      if (typeof opts.writeInventory === "function") opts.writeInventory(inv);
      else {
        inv.updated = new Date().toISOString();
        fs.writeFileSync(path.join(dataDir, "inventory.json"), JSON.stringify(inv, null, 2));
      }
      res.json({ ok: true, sku: sku, dealerPrice: dealerPrice, retailPrice: item.price });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/admin/dealers", auth, function (req, res) {
    res.sendFile(path.join(__dirname, "admin", "dealers.html"));
  });

  console.log("Wholesale routes: registered (catalog = FreePort Wholesale tab only)");
};
