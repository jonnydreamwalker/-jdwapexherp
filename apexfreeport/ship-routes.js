/**
 * ApexFreePort — ship + create-order routes
 * Loaded from server.js via: require("./ship-routes")(app, { auth, readOrders, writeOrders, findOrder, enrichOrder, skuLookup });
 */
module.exports = function registerShipRoutes(app, deps) {
  var auth = deps.auth;
  var readOrders = deps.readOrders;
  var writeOrders = deps.writeOrders;
  var findOrder = deps.findOrder;
  var enrichOrder = deps.enrichOrder;
  var skuLookup = deps.skuLookup;

  function trackingUrlFor(carrier, tracking) {
    var c = String(carrier || "").toLowerCase();
    var t = encodeURIComponent(String(tracking || ""));
    if (c.indexOf("ups") >= 0) return "https://www.ups.com/track?tracknum=" + t;
    if (c.indexOf("fedex") >= 0) return "https://www.fedex.com/fedextrack/?trknbr=" + t;
    if (c.indexOf("dhl") >= 0) return "https://www.dhl.com/en/express/tracking.html?AWB=" + t;
    return "https://tools.usps.com/go/TrackConfirmAction?tLabels=" + t;
  }

  function nextOrderId(orders) {
    var max = 1000;
    (orders || []).forEach(function (o) {
      var m = String(o.id || "").match(/(\d+)/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    return "ORD-" + (max + 1);
  }

  app.post("/api/fulfillment/orders", auth, function (req, res) {
    var d = readOrders();
    var b = req.body || {};
    var inv = skuLookup();
    var itemsIn = Array.isArray(b.items) ? b.items : [];
    if (!itemsIn.length) return res.status(400).json({ error: "items required" });
    var shipTo = b.shipTo || {};
    if (!String(shipTo.name || "").trim() || !String(shipTo.line1 || "").trim()) {
      return res.status(400).json({ error: "shipTo name and line1 required" });
    }
    var items = itemsIn.map(function (it) {
      var sku = String(it.sku || "").trim();
      var invIt = inv[sku] || {};
      return {
        sku: sku,
        name: String(it.name || invIt.name || sku),
        qty: Math.max(1, Number(it.qty) || 1),
        price: Number(it.price != null ? it.price : invIt.price) || 0,
        dropShip: !!(it.dropShip || invIt.dropShip || invIt.lane === "external"),
        supplier: it.supplier || invIt.supplier || "",
        shippingTerms: it.shippingTerms || invIt.shippingTerms || ""
      };
    });
    var id = String(b.id || "").trim() || nextOrderId(d.orders);
    if (findOrder(d, id)) return res.status(409).json({ error: "order id exists" });
    var order = {
      id: id,
      created: new Date().toISOString(),
      store: String(b.store || "herp").toLowerCase(),
      status: "open",
      service: String(b.service || "ground"),
      serviceLabel: String(b.serviceLabel || b.service || "Ground"),
      payment: {
        method: String((b.payment && b.payment.method) || b.paymentMethod || "manual"),
        amount:
          Number((b.payment && b.payment.amount) != null ? b.payment.amount : b.amount) ||
          items.reduce(function (s, it) {
            return s + it.price * it.qty;
          }, 0),
        ref: String((b.payment && b.payment.ref) || b.paymentRef || "")
      },
      customer: {
        name: String((b.customer && b.customer.name) || shipTo.name || ""),
        email: String((b.customer && b.customer.email) || b.email || ""),
        phone: String((b.customer && b.customer.phone) || b.phone || "")
      },
      shipTo: {
        name: String(shipTo.name || ""),
        line1: String(shipTo.line1 || ""),
        line2: String(shipTo.line2 || ""),
        city: String(shipTo.city || ""),
        state: String(shipTo.state || ""),
        zip: String(shipTo.zip || ""),
        country: String(shipTo.country || "US")
      },
      items: items,
      boxes: Array.isArray(b.boxes) ? b.boxes : [],
      handling: Array.isArray(b.handling) ? b.handling : [],
      notes: Array.isArray(b.notes) ? b.notes : b.note ? [String(b.note)] : [],
      shipping: null,
      labelPrintedAt: null,
      shippedAt: null,
      fulfilledAt: null
    };
    d.orders = d.orders || [];
    d.orders.push(order);
    writeOrders(d);
    res.json({ ok: true, order: enrichOrder(order, inv) });
  });

  app.post("/api/fulfillment/orders/:id/ship", auth, function (req, res) {
    var d = readOrders();
    var o = findOrder(d, req.params.id);
    if (!o) return res.status(404).json({ error: "not found" });
    var b = req.body || {};
    var tracking = String(b.tracking || "").trim();
    if (!tracking) return res.status(400).json({ error: "tracking required" });
    var carrier = String(b.carrier || "USPS").trim() || "USPS";
    var insAmt = Number(b.insuranceAmount);
    var insuranceAmount = isNaN(insAmt) ? 0 : Math.max(0, insAmt);
    var now = new Date().toISOString();
    o.shipping = {
      carrier: carrier,
      tracking: tracking,
      trackingUrl: String(b.trackingUrl || "").trim() || trackingUrlFor(carrier, tracking),
      insuranceAmount: insuranceAmount,
      insuranceProvider:
        String(b.insuranceProvider || "").trim() ||
        (insuranceAmount > 0 ? "Carrier / Pirate Ship" : "None"),
      insuranceNotes: String(b.insuranceNotes || "").trim(),
      labelCost: b.labelCost != null && b.labelCost !== "" ? Number(b.labelCost) : null,
      shippedAt: now
    };
    o.status = "shipped";
    o.shippedAt = now;
    if (b.note) {
      o.notes = o.notes || [];
      o.notes.push(String(b.note));
    }
    writeOrders(d);
    res.json({ ok: true, order: o });
  });

  app.post("/api/fulfillment/orders/:id/unship", auth, function (req, res) {
    var d = readOrders();
    var o = findOrder(d, req.params.id);
    if (!o) return res.status(404).json({ error: "not found" });
    o.status = "open";
    o.shippedAt = null;
    writeOrders(d);
    res.json({ ok: true, order: o });
  });
};
