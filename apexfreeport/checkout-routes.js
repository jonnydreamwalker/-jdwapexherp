/**
 * Checkout: Stripe + Square + PayPal
 * POST /api/checkout/stripe|square|paypal
 * GET  /api/checkout/status
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

function postPaypalToken(host, authHeader) {
  return new Promise(function (resolve, reject) {
    const data = "grant_type=client_credentials";
    const req = https.request(
      {
        hostname: host,
        path: "/v1/oauth2/token",
        method: "POST",
        headers: {
          Authorization: authHeader,
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

function paypalHost() {
  const mode = String(process.env.PAYPAL_MODE || "sandbox").toLowerCase();
  if (mode === "live" || mode === "production") return "api-m.paypal.com";
  return "api-m.sandbox.paypal.com";
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

    if (!locationId || String(locationId).indexOf("PASTE_") === 0) {
      return res.status(503).json({
        error: "square_location_required",
        message: "Set SQUARE_LOCATION_ID in /etc/apexfreeport.env"
      });
    }

    const lineItems = items.map(function (it) {
      return {
        name: it.name,
        quantity: String(it.quantity),
        item_type: "ITEM",
        base_price_money: { amount: it.amountCents, currency: "USD" }
      };
    });

    const body = {
      idempotency_key: "fp-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10),
      order: { location_id: locationId, line_items: lineItems },
      checkout_options: { redirect_url: success }
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
        return res.json({ ok: true, url: url, id: r.body.payment_link.id, host: host });
      }
      return res.status(502).json({
        error: "square_failed",
        message:
          (r.body && r.body.errors && r.body.errors[0] && r.body.errors[0].detail) ||
          "Square could not create payment link",
        detail: r.body,
        host: host
      });
    } catch (e) {
      return res.status(500).json({ error: "square_error", message: e.message });
    }
  });

  app.post("/api/checkout/paypal", async function (req, res) {
    const id = process.env.PAYPAL_CLIENT_ID;
    const secret = process.env.PAYPAL_CLIENT_SECRET;
    if (!id || !secret) {
      return res.status(503).json({
        error: "paypal_not_configured",
        message: "PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET missing on FreePort"
      });
    }
    const items = normalizeItems((req.body && req.body.items) || []);
    if (!items.length) {
      return res.status(400).json({ error: "empty_cart", message: "Cart has no priced items" });
    }
    const success =
      (req.body && req.body.successUrl) ||
      process.env.CHECKOUT_SUCCESS_URL ||
      "https://jdwapexherp.com/?paid=paypal";
    const cancel =
      (req.body && req.body.cancelUrl) ||
      process.env.CHECKOUT_CANCEL_URL ||
      "https://jdwapexherp.com/?cancel=1";

    const total = items.reduce(function (s, it) {
      return s + it.price * it.quantity;
    }, 0);
    const value = total.toFixed(2);
    const host = paypalHost();

    try {
      const auth = Buffer.from(id + ":" + secret).toString("base64");
      const tok = await postPaypalToken(host, "Basic " + auth);
      if (!(tok.status >= 200 && tok.status < 300) || !tok.body || !tok.body.access_token) {
        return res.status(502).json({
          error: "paypal_auth_failed",
          message: "PayPal could not authenticate — check sandbox vs live credentials",
          detail: tok.body
        });
      }
      const access = tok.body.access_token;
      const orderBody = {
        intent: "CAPTURE",
        purchase_units: [
          {
            amount: {
              currency_code: "USD",
              value: value,
              breakdown: { item_total: { currency_code: "USD", value: value } }
            },
            items: items.map(function (it) {
              return {
                name: it.name.slice(0, 127),
                sku: it.sku || undefined,
                quantity: String(it.quantity),
                unit_amount: { currency_code: "USD", value: it.price.toFixed(2) }
              };
            })
          }
        ],
        application_context: {
          brand_name: "JDW Apex Herp Supply",
          landing_page: "NO_PREFERENCE",
          user_action: "PAY_NOW",
          return_url: success,
          cancel_url: cancel
        }
      };
      const r = await postForm(
        host,
        "/v2/checkout/orders",
        { Authorization: "Bearer " + access, "Content-Type": "application/json" },
        orderBody
      );
      const approve =
        r.body &&
        r.body.links &&
        r.body.links.filter(function (l) {
          return l.rel === "approve";
        })[0];
      if (r.status >= 200 && r.status < 300 && approve && approve.href) {
        return res.json({
          ok: true,
          url: approve.href,
          id: r.body.id,
          mode: host.indexOf("sandbox") >= 0 ? "sandbox" : "live"
        });
      }
      return res.status(502).json({
        error: "paypal_failed",
        message:
          (r.body && r.body.message) ||
          (r.body && r.body.details && r.body.details[0] && r.body.details[0].description) ||
          "PayPal could not create order",
        detail: r.body
      });
    } catch (e) {
      return res.status(500).json({ error: "paypal_error", message: e.message });
    }
  });

  app.get("/api/checkout/status", function (req, res) {
    const sk = process.env.STRIPE_SECRET_KEY || "";
    const loc = process.env.SQUARE_LOCATION_ID || "";
    const locOk = loc && String(loc).indexOf("PASTE_") !== 0;
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
      squareLocation: locOk ? "set" : "missing",
      paypal: process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET ? "set" : "missing",
      paypalMode: process.env.PAYPAL_MODE || "sandbox"
    });
  });
};
