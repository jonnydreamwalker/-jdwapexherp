/**
 * ApexFreePort — Wholesale dealer applications + portal API
 * Mount: require("./wholesale-routes")(app, { auth, dataDir, readInventory, writeInventory });
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
    return { salt, hash };
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

  function dealerFromToken(req) {
    const t = req.headers["x-dealer-token"] || (req.session && req.session.dealerToken);
    if (!t) return null;
    const db = readDealers();
    return (db.dealers || []).find(function (d) {
      return d.status === "active" && d.sessionToken === t;
    }) || null;
  }

  function publicDealer(d) {
    return {
      id: d.id,
      email: d.email,
      business_name: d.business_name,
      contact_name: d.contact_name,
      status: d.status
    };
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
        hasPassword: !!(d.passHash && d.passSalt)
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

  app.get("/api/wholesale/catalog", function (req, res) {
    const d = dealerFromToken(req);
    if (!d) return res.status(401).json({ error: "Unauthorized" });
    try {
      let inv;
      if (typeof opts.readInventory === "function") {
        inv = opts.readInventory();
      } else {
        const invPath = path.join(dataDir, "inventory.json");
        inv = JSON.parse(fs.readFileSync(invPath, "utf8"));
      }
      let items = inv.items || [];
      // Dealer portal: 50 lb and up only
      items = items.filter(function (i) {
        var w = Number(i.weightLb) || 0;
        if (w >= 50) return true;
        var n = String(i.name || "").toLowerCase();
        var m = n.match(/(\d+)\s*lb/);
        if (m && Number(m[1]) >= 50) return true;
        return false;
      });
      const cat = req.query.category;
      if (cat) {
        const c = String(cat).toLowerCase();
        items = items.filter(function (i) {
          return String(i.category || "").toLowerCase() === c;
        });
      }
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
          image: i.image || "",
          retailPrice: retail,
          dealerPrice: dealer,
          qty: i.qty,
          reserved: i.reserved,
          available: Math.max(0, (i.qty || 0) - (i.reserved || 0)),
          status: i.status,
          lane: i.lane,
          weightLb: i.weightLb || null
        };
      });
      res.json({
        warehouse: inv.warehouse || "DeFuniak Springs, FL",
        updated: inv.updated,
        dealer: publicDealer(d),
        items: mapped
      });
    } catch (e) {
      res.status(500).json({ error: "Catalog unavailable" });
    }
  });

  app.post("/api/wholesale/sku-price", auth, function (req, res) {
    try {
      const sku = req.body && req.body.sku;
      const dealerPrice = Number(req.body && req.body.dealerPrice);
      if (!sku || isNaN(dealerPrice)) return res.status(400).json({ error: "sku and dealerPrice required" });
      let inv;
      if (typeof opts.readInventory === "function") inv = opts.readInventory();
      else inv = JSON.parse(fs.readFileSync(path.join(dataDir, "inventory.json"), "utf8"));
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

  console.log("Wholesale routes: registered → notify", notifyEmail);
};
