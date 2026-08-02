/**
 * JDW Apex FreePort — SKU shipping rule engine
 * SKU: [PREFIX]-[WEIGHT]-[BOX|UNS]-[QTY]-[MAT]-[SUFFIX]
 * Examples: HS-050-361617-001-CK-B | HS-050-UNS-001-CK-B
 * Require: const ship = require("./ship-sku-engine");
 */
const https = require("https");

/** ----- Shipping logic (JDW Apex) — SKU rule engine -----
 * SKU: [PREFIX]-[WEIGHT]-[BOX|UNS]-[QTY]-[MAT]-[SUFFIX…]
 *  seg2 = weightLbs (float)
 *  seg3 = 6-digit W×L×H inches → dimensional weight, or UNS → actual weight only
 *  seg4 = package qty multiplier on rate
 *  ends with -B = Bulk FOB Origin (separate freight invoice)
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
          UnitOfMeasurement: { Code: "LBS" },
          Weight: String(wEach)
        }
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
    var packages = items && items.length ? buildUpsPackages(items) : null;
    if (!packages) {
      var w = Math.max(1, Math.ceil(Number(weightLbs) || 1));
      packages = [{
        PackagingType: { Code: "02", Description: "Package" },
        PackageWeight: { UnitOfMeasurement: { Code: "LBS" }, Weight: String(w) }
      }];
    }
    var body = JSON.stringify({
      RateRequest: {
        Request: { RequestOption: "Rate" },
        Shipment: {
          Shipper: {
            Name: "JDW Apex FreePort",
            ShipperNumber: process.env.UPS_ACCOUNT_NUMBER,
            Address: { PostalCode: shipperZip, CountryCode: "US" }
          },
          ShipTo: {
            Address: {
              PostalCode: String(destZip).replace(/\D/g, "").slice(0, 5),
              CountryCode: "US"
            }
          },
          ShipFrom: { Address: { PostalCode: shipperZip, CountryCode: "US" } },
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
            Authorization: "Bearer " + access,
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
            transId: "fp-" + Date.now(),
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
                j.RateResponse &&
                j.RateResponse.RatedShipment &&
                j.RateResponse.RatedShipment[0];
              var total =
                rated &&
                rated.TotalCharges &&
                rated.TotalCharges.MonetaryValue;
              if (total) resolve(Math.round(parseFloat(total) * 100) / 100);
              else reject(new Error("ups_no_rate"));
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

async function quoteShipping(items, destZip) {
  var subtotal = Math.round(cartSubtotal(items) * 100) / 100;
  var weight = Math.round(cartWeightLbs(items) * 100) / 100;
  var HANDLING = 5.0;
  var under40 = 6.5;
  var mid = 7.95;
  var packFactor = rateMultiplierFromSkus(items);
  var bulkLines = (items || []).filter(function (it) {
    return parseSku(it.sku).fobOrigin;
  });
  var hasBulk = bulkLines.length > 0;

  if (hasBulk && bulkLines.length === (items || []).length) {
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
      packQtyTotal: packFactor
    };
  }

  if (subtotal < 40 && weight <= 10 && !hasBulk) {
    return {
      amount: under40,
      method: "flat",
      label: "Standard shipping",
      tier: "under40",
      weightLbs: weight,
      subtotal: subtotal,
      handling: 0,
      packQtyTotal: packFactor
    };
  }
  if (subtotal < 75 && weight <= 10 && !hasBulk) {
    return {
      amount: mid,
      method: "flat",
      label: "Standard shipping",
      tier: "mid40to75",
      weightLbs: weight,
      subtotal: subtotal,
      handling: 0,
      packQtyTotal: packFactor
    };
  }

  var upsRate = null;
  var source = "estimated_ups";
  var zip = destZip && String(destZip).replace(/\D/g, "").slice(0, 5);
  if (zip && zip.length >= 5 && upsConfigured()) {
    try {
      upsRate = await fetchUpsGroundRate(weight, zip, items);
      source = "ups_ground";
    } catch (e) {
      console.error("UPS rate error:", e.message);
    }
  }
  if (upsRate == null) {
    upsRate = fallbackUpsGround(weight, zip);
    source = "estimated_ups";
  }
  var amount = Math.round((Number(upsRate) + HANDLING) * 100) / 100;
  return {
    amount: amount,
    method: source,
    label: hasBulk
      ? "UPS Ground + handling (non-bulk lines; bulk FOB separate)"
      : "UPS Ground + handling",
    tier: "heavy_or_over75",
    upsGround: Math.round(Number(upsRate) * 100) / 100,
    handling: HANDLING,
    weightLbs: weight,
    subtotal: subtotal,
    bulk: hasBulk,
    fobOrigin: hasBulk,
    packQtyTotal: packFactor
  };
}

module.exports = {
  parseSku,
  unitBillableLbs,
  defaultWeightLbs,
  cartWeightLbs,
  cartSubtotal,
  quoteShipping,
  cartHasBulkFob,
  upsConfigured
};
