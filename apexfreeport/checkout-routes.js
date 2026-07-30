/**
 * Checkout: Stripe Checkout Session + Square Payment Link
 * POST /api/checkout/stripe  { items:[{name,sku,price,quantity}], successUrl?, cancelUrl? }
 * POST /api/checkout/square  { items:[...], successUrl?, cancelUrl? }
 */
const https = require("https");

function postForm(hostname, path, headers, body) {
  return new Promise(function (resolve, reject) {
    const data = typeof body === "string" ? body : JSON.stringify(body);
    const req = https.request(
      {
        hostname: hostname,
        path: path,
        method: "POST",
        headers: Object.assign(
          {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(data)
          },
          headers
        )
      },
      function (res) {
        let raw = "";
        res.on("data", function (c) {
          raw += c;
        });
        res.on("end", function () {
          let json = null;
          try {
            json = JSON.parse(raw);
          } catch (e) {
            json = { raw: raw };
          }
          resolve({ status: res.statusCode, body: json });
        });
      }
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

function postStripeForm(secret, formBody) {
  return new Promise(function (resolve, reject) {
    const data = formBody;
    const auth = Buffer.from(secret + ":").toString("base64");
    const req = https.request(
      {
        hostname: "api.stripe.com",
        path: "/v1/checkout/sessions",
        method: "POST",
        headers: {
          Authorization: "Basic " + auth,
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(data)
        }
      },
      function (res) {
        let raw = "";
        res.on("data", function (c) {
          raw += c;
        });
        res.on("end", function () {
          let json = null;
          try {
            json = JSON.parse(raw);
          } catch (e) {
            json = { raw: raw };
          }
          resolve({ status: res.statusCode, body: json });
        });
      }
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

function normalizeItems(raw) {
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map(function (it) {
      const qty = Math.max(1, parseInt(it.quantity || it.qty || 1, 10) || 1);
      const price = Math.round((Number(it.price) || 0) * 100) / 100;
      return {
        name: String(it.name || it.sku || "Item").slice(0, 120),
        sku: String(it.sku || "").slice(0, 64),
        price: price,
        quantity: qty,
        amountCents: Math.round(price * 100)
      };
    })
    .filter(function (it) {
      return it.amountCents > 0 && it.quantity > 0;
    });
}

function squareHost() {
  const env = String(process.env.SQUARE_ENV || "").toLowerCase();
  if (env === "production" || env === "prod" || process.env.SQUARE_FORCE_PROD === "1") {
    return "connect.squareup.com";
  }
  return "connect.squareupsandbox.com";
}

module.exports = function mountCheckout(app) {
  app.post("/api/checkout/stripe", async function (req, res) {
    const secret = process.env.STRIPE_SECRET_KEY;
    if (!secret) {
      return res.status(503).json({
        error: "stripe_not_configured",
        message: "STRIPE_SECRET_KEY missing on FreePort"
      });
    }
    const items = normalizeItems((req.body && req.body.items) || []);
    if (!items.length) {
      return res.status(400).json({ error: "empty_cart", message: "Cart has no priced items" });
    }
    const success =
      (req.body && req.body.successUrl) ||
      process.env.CHECKOUT_SUCCESS_URL ||
      "https://jdwapexherp.com/?paid=stripe";
    const cancel =
      (req.body && req.body.cancelUrl) ||
      process.env.CHECKOUT_CANCEL_URL ||
      "https://jdwapexherp.com/?cancel=1";

    const parts = [];
    parts.push("mode=payment");
    parts.push("success_url=" + encodeURIComponent(success));
    parts.push("cancel_url=" + encodeURIComponent(cancel));
    items.forEach(function (it, i) {
      parts.push("line_items[" + i + "][quantity]=" + it.quantity);
      parts.push("line_items[" + i + "][price_data][currency]=usd");
      parts.push("line_items[" + i + "][price_data][unit_amount]=" + it.amountCents);
      parts.push(
        "line_items[" + i + "][price_data][product_data][name]=" + encodeURIComponent(it.name)
      );
      if (it.sku) {
        parts.push(
          "line_items[" +
            i +
            "][price_data][product_data][metadata][sku]=" +
            encodeURIComponent(it.sku)
        );
      }
    });

    try {
      const r = await postStripeForm(secret, parts.join("&"));
      if (r.status >= 200 && r.status < 300 && r.body && r.body.url) {
        return res.json({
          ok: true,
          url: r.body.url,
          id: r.body.id,
          mode: String(secret).indexOf("sk_live") === 0 ? "live" : "test"
        });
      }
      return res.status(502).json({
        error: "stripe_failed",
        message:
          (r.body && r.body.error && r.body.error.message) ||
          "Stripe could not create checkout session",
        detail: r.body
      });
    } catch (e) {
      return res.status(500).json({ error: "stripe_error", message: e.message });
    }
  });

  app.post("/api/checkout/square", async function (req, res) {
    const token = process.env.SQUARE_ACCESS_TOKEN;
    if (!token) {
      return res.status(503).json({
        error: "square_not_configured",
        message: "SQUARE_ACCESS_TOKEN missing on FreePort"
      });
    }
    const items = normalizeItems((req.body && req.body.items) || []);
    if (!items.length) {
      return res.status(400).json({ error: "empty_cart", message: "Cart has no priced items" });
    }
    const success =
      (req.body && req.body.successUrl) ||
      process.env.CHECKOUT_SUCCESS_URL ||
      "https://jdwapexherp.com/?paid=square";
    const host = squareHost();
    const locationId = process.env.SQUARE_LOCATION_ID || "";

    if (!locationId) {
      return res.status(503).json({
        error: "square_location_required",
        message:
          "Set SQUARE_LOCATION_ID in /etc/apexfreeport.env (Square Dashboard → Locations)"
      });
    }

    const lineItems = items.map(function (it) {
      return {
        name: it.name,
        quantity: String(it.quantity),
        item_type: "ITEM",
        base_price_money: {
          amount: it.amountCents,
          currency: "USD"
        }
      };
    });

    const body = {
      idempotency_key:
        "fp-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10),
      order: {
        location_id: locationId,
        line_items: lineItems
      },
      checkout_options: {
        redirect_url: success
      }
    };

    try {
      const r = await postForm(
        host,
        "/v2/online-checkout/payment-links",
        {
          Authorization: "Bearer " + token,
          "Square-Version": "2024-01-18"
        },
        body
      );
      const url =
        r.body &&
        r.body.payment_link &&
        (r.body.payment_link.url || r.body.payment_link.long_url);
      if (r.status >= 200 && r.status < 300 && url) {
        return res.json({
          ok: true,
          url: url,
          id: r.body.payment_link.id,
          host: host
        });
      }
      return res.status(502).json({
        error: "square_failed",
        message:
          (r.body &&
            r.body.errors &&
            r.body.errors[0] &&
            r.body.errors[0].detail) ||
          "Square could not create payment link",
        detail: r.body,
        host: host
      });
    } catch (e) {
      return res.status(500).json({ error: "square_error", message: e.message });
    }
  });

  app.get("/api/checkout/status", function (req, res) {
    const sk = process.env.STRIPE_SECRET_KEY || "";
    res.json({
      stripe: sk
        ? sk.indexOf("sk_live") === 0
          ? "live"
          : sk.indexOf("sk_test") === 0
            ? "test"
            : "set"
        : "missing",
      square: process.env.SQUARE_ACCESS_TOKEN ? "set" : "missing",
      squareHost: process.env.SQUARE_ACCESS_TOKEN ? squareHost() : null,
      squareLocation: process.env.SQUARE_LOCATION_ID ? "set" : "missing"
    });
  });
};
