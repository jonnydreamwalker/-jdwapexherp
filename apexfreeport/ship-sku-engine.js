/**
 * JDW Apex FreePort — SKU shipping rule engine
 * SKU: [PREFIX]-[WEIGHT]-[BOX|UNS]-[QTY]-[MAT]-[SUFFIX]
 * Examples: HS-050-361617-001-CK-B | HS-050-UNS-001-CK-B | AP-001-UNS-001-XX-A
 * -B = Bulk FOB Origin | -A = accessory flat $7.95 per 35 units (ceil)
 * Require: const ship = require("./ship-sku-engine");
 */
const https = require("https");

/** ----- Shipping logic (JDW Apex) — SKU rule engine -----
 * SKU: [PREFIX]-[WEIGHT]-[BOX|UNS]-[QTY]-[MAT]-[SUFFIX…]
 *  seg2 = weightLbs (float)
 *  seg3 = 6-digit W×L×H inches → dimensional weight, or UNS → actual weight only
 *  seg4 = package qty multiplier on rate
 *  ends with -B = Bulk FOB Origin (separate freight invoice)
 *  ends with -A = accessory buckets Math.ceil(qty/35)*7.95
 */
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
    fobOrigin: false,
    accessoryA: false
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
  // -A = accessory flat-rate buckets: ceil(qty/35)*7.95
  if (segs.length && segs[segs.length - 1] === "A") {
    out.accessoryA = true;
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
    if (sku.indexOf("HS-") === 0 || name.indexOf("cork") >= 0 || name.indexOf("hardscape") >= 0) actual = 5;
    else actual = 1;
  }
  if (meta.unspec || !meta.dims) {
    return { lbs: actual, meta: meta, dimLbs: 0, actualLbs: actual };
  }
  var dimLbs = dimWeightLbs(meta.dims);
  var billable = Math.max(actual, dimLbs);
  return { lbs: billable, meta: meta, dimLbs: dimLbs, actualLbs: actual };
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

function cartHasBulkFob(items) {
  return (items || []).some(function (it) {
    return parseSku(it.sku).fobOrigin === true;
  });
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
  var rate = base + perLb * w + zoneBump;
  return Math.round(Math.max(12, rate) * 100) / 100;
}

function upsToken() {
  return new Promise(function (resolve, reject) {
    var id = process.env.UPS_CLIENT_ID;
    var secret = process.env.UPS_CLIENT_SECRET;
    var data = "grant_type=client_credentials";
    var auth = Buffer.from(id + ":" + secret).toString("base64");
    var host = process.env.UPS_API_HOST || "onlinetools.ups.com";
    var req = https.request(
      {
        hostname: host,
        path: "/security/v1/oauth/token",
        method: "POST",
        headers: {
          Authorization: "Basic " + auth,
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(data),
          "x-merchant-id": process.env.UPS_ACCOUNT_NUMBER || ""
        }
      },
      function (res) {
        var raw = "";
        res.on("data", function (c) { raw += c; });
        res.on("end", function () {
          try { resolve(JSON.parse(raw)); } catch (e) { resolve({ raw: raw }); }
        });
      }
    );
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
        PackageWeight: {
          UnitOfMeasurement: { Code: "LBS", Description: "Pounds" },
          Weight: String(wEach)
        }
      };
      if (u.meta.dims) {
        pkg.Dimensions = {
          UnitOfMeasurement: { Code: "IN", Description: "Inches" },
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
      PackageWeight: {
        UnitOfMeasurement: { Code: "LBS", Description: "Pounds" },
        Weight: "1"
      }
    });
  }
  return packages;
}

function fetchUpsGroundRate(weightLbs, destZip, items) {
  return upsToken().then(function (tok) {
    if (!tok || !tok.access_token) throw new Error("UPS token failed");
    var host = process.env.UPS_API_HOST || "onlinetools.ups.com";
    var shipper = process.env.UPS_SHIPPER_NUMBER || process.env.UPS_ACCOUNT_NUMBER;
    var fromZip = process.env.UPS_ORIGIN_ZIP || "32433";
    var packages = buildUpsPackages(items);
    var body = JSON.stringify({
      RateRequest: {
        Request: { TransactionReference: { CustomerContext: "ApexFreePort" } },
        Shipment: {
          Shipper: {
            Name: "JDW Apex FreePort",
            ShipperNumber: shipper,
            Address: { PostalCode: fromZip, CountryCode: "US" }
          },
          ShipTo: {
            Name: "Customer",
            Address: { PostalCode: String(destZip).slice(0, 5), CountryCode: "US" }
          },
          ShipFrom: {
            Name: "JDW Apex FreePort",
            Address: { PostalCode: fromZip, CountryCode: "US" }
          },
          Service: { Code: "03", Description: "UPS Ground" },
          Package: packages
        }
      }
    });
    return new Promise(function (resolve, reject) {
      var req = https.request(
        {
          hostname: host,
          path: "/api/rating/v1/Rate",
          method: "POST",
          headers: {
            Authorization: "Bearer " + tok.access_token,
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
            transId: "apex-" + Date.now(),
            transactionSrc: "ApexFreePort"
          }
        },
        function (res) {
          var raw = "";
          res.on("data", function (c) { raw += c; });
          res.on("end", function () {
            try {
              var j = JSON.parse(raw);
              var rated =
                j &&
                j.RateResponse &&
                j.RateResponse.RatedShipment &&
                j.RateResponse.RatedShipment[0];
              var total =
                rated &&
                rated.TotalCharges &&
                rated.TotalCharges.MonetaryValue;
              if (total != null) resolve(parseFloat(total));
              else reject(new Error("No UPS rate in response"));
            } catch (e) {
              reject(e);
            }
          });
        }
      );
      req.on("error", reject);
      req.write(body);
      req.end();
    });
  });
}

/** -A SKU accessory shipping: $7.95 per 35 units (ceil) */
function isAccessoryA(it) {
  var sku = String((it && it.sku) || "").toUpperCase();
  return sku.endsWith("-A") || parseSku(sku).accessoryA === true;
}

function accessoryAQuantity(items) {
  return (items || []).reduce(function (s, it) {
    if (!isAccessoryA(it)) return s;
    return s + (Number(it.quantity) || 1);
  }, 0);
}

function accessoryAShippingCost(items) {
  var totalQuantity = accessoryAQuantity(items);
  if (totalQuantity <= 0) return 0;
  // 1–35 → $7.95; 36–70 → $15.90; every 35 after that another $7.95
  return Math.ceil(totalQuantity / 35) * 7.95;
}

async function quoteShipping(items, destZip) {
  var allItems = items || [];
  // -A accessory lines: separate $7.95 / 35-unit buckets
  var aLines = allItems.filter(isAccessoryA);
  var nonA = allItems.filter(function (it) { return !isAccessoryA(it); });
  var aShipCost = Math.round(accessoryAShippingCost(allItems) * 100) / 100;
  var aQty = accessoryAQuantity(allItems);

  var subtotal = Math.round(cartSubtotal(allItems) * 100) / 100;
  var HANDLING = 5.0;
  var under40 = 6.5;
  var mid = 7.95;

  // Rate main shipping on non-A lines only (bulk / weight / UPS)
  var weight = Math.round(cartWeightLbs(nonA) * 100) / 100;
  var packFactor = rateMultiplierFromSkus(nonA);
  var bulkLines = nonA.filter(function (it) {
    return parseSku(it.sku).fobOrigin;
  });
  var hasBulk = bulkLines.length > 0;

  // Cart is only -A accessories
  if (nonA.length === 0 && aLines.length > 0) {
    return {
      amount: aShipCost,
      method: "accessory_a_flat",
      label: "Accessory shipping ($7.95 per 35 units)",
      tier: "accessory_a",
      weightLbs: 0,
      subtotal: subtotal,
      handling: 0,
      accessoryAShipping: aShipCost,
      accessoryAQty: aQty,
      packQtyTotal: aQty
    };
  }

  if (hasBulk && bulkLines.length === nonA.length && aLines.length === 0) {
    return {
      amount: 0,
      method: "fob_origin",
      label: "FOB Origin — freight invoiced separately (Bulk)",
      tier: "bulk_fob",
      weightLbs: weight,
      subtotal: subtotal,
      handling: 0,
      bulk: true,
      fobOrigin: true,
      accessoryAShipping: 0,
      accessoryAQty: 0,
      packQtyTotal: packFactor
    };
  }

  // Bulk-only non-A + any -A: FOB 0 for bulk + accessory buckets
  if (hasBulk && bulkLines.length === nonA.length && aLines.length > 0) {
    return {
      amount: aShipCost,
      method: "fob_plus_accessory_a",
      label: "FOB bulk + accessory shipping ($7.95 per 35)",
      tier: "bulk_fob_accessory_a",
      weightLbs: weight,
      subtotal: subtotal,
      handling: 0,
      bulk: true,
      fobOrigin: true,
      accessoryAShipping: aShipCost,
      accessoryAQty: aQty,
      packQtyTotal: packFactor
    };
  }

  var mainAmount = 0;
  var method = "flat";
  var label = "Standard shipping";
  var tier = "under40";
  var upsGround = null;

  var nonASub = Math.round(cartSubtotal(nonA) * 100) / 100;
  if (nonASub < 40 && weight <= 10 && !hasBulk) {
    mainAmount = under40;
    method = "flat";
    label = "Standard shipping";
    tier = "under40";
  } else if (nonASub < 75 && weight <= 10 && !hasBulk) {
    mainAmount = mid;
    method = "flat";
    label = "Standard shipping";
    tier = "mid40to75";
  } else {
    var upsRate = null;
    var source = "estimated_ups";
    var zip = destZip && String(destZip).replace(/\D/g, "").slice(0, 5);
    if (zip && zip.length >= 5 && upsConfigured()) {
      try {
        upsRate = await fetchUpsGroundRate(weight, zip, nonA);
        source = "ups_ground";
      } catch (e) {
        console.error("UPS rate error:", e.message);
      }
    }
    if (upsRate == null) {
      upsRate = fallbackUpsGround(weight, zip);
      source = "estimated_ups";
    }
    mainAmount = Math.round((Number(upsRate) + HANDLING) * 100) / 100;
    method = source;
    label = hasBulk
      ? "UPS Ground + handling (non-bulk; bulk FOB separate)"
      : "UPS Ground + handling";
    tier = "heavy_or_over75";
    upsGround = Math.round(Number(upsRate) * 100) / 100;
  }

  // Final: main shipping + -A accessory buckets
  var amount = Math.round((mainAmount + aShipCost) * 100) / 100;
  if (aShipCost > 0) {
    label = label + " + accessory ($7.95/35)";
  }
  var out = {
    amount: amount,
    method: method,
    label: label,
    tier: tier,
    weightLbs: weight,
    subtotal: subtotal,
    handling: tier === "heavy_or_over75" ? HANDLING : 0,
    bulk: hasBulk,
    fobOrigin: hasBulk,
    accessoryAShipping: aShipCost,
    accessoryAQty: aQty,
    packQtyTotal: packFactor
  };
  if (upsGround != null) out.upsGround = upsGround;
  return out;
}

module.exports = {
  parseSku,
  unitBillableLbs,
  defaultWeightLbs,
  cartWeightLbs,
  cartSubtotal,
  quoteShipping,
  cartHasBulkFob,
  upsConfigured,
  isAccessoryA,
  accessoryAQuantity,
  accessoryAShippingCost
};
