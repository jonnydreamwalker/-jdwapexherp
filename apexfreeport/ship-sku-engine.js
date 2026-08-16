/**
 * JDW Apex FreePort — SKU shipping rule engine
 * SKU: [PREFIX]-[WEIGHT]-[BOX|UNS]-[QTY]-[MAT]-[SUFFIX]
 * Examples: HS-050-361617-001-CK-B | HS-050-UNS-001-CK-B | AP-001-UNS-001-XX-A
 * -B = Bulk FOB Origin | -A = accessory flat $7.95 per 35 units (ceil)
 * Free $100+ requires 3+ items; lone -64 diets ship flat (free OK if 3+ items in cart)
 * RSC in SKU = rate from 75418 (internal only — never shown to customer)
 * Trailing -2..-9 = units per ship box (e.g. cork -3)
 * Require: const ship = require("./ship-sku-engine");
 *
 * Rates (2026-08):
 *  - Light packages (≤10 lb, no bulk): single $7.95 flat — never stack standard+accessory
 *  - Orders $100+ (≤20 lb, no bulk): FREE standard shipping
 *  - Bulk -B: FOB $0 on portal (freight separate)
 *  - Heavy: UPS estimate + handling
 */
const https = require("https");

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
  if (segs.length && segs[segs.length - 1] === "A") {
    out.accessoryA = true;
  }
  if (segs.length && !out.bulk && !out.accessoryA) {
    var last = segs[segs.length - 1];
    if (/^[2-9]$/.test(last)) {
      out.unitsPerBox = parseInt(last, 10);
    }
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

function shipBoxCount(it) {
  var meta = parseSku(it && it.sku);
  var qty = Number(it && it.quantity) || Number(it && it.qty) || 1;
  var per = meta.unitsPerBox || 0;
  if (per >= 2) {
    return Math.ceil(qty / per) * (meta.packQty || 1);
  }
  return (meta.packQty || 1) * qty;
}

function rateMultiplierFromSkus(items) {
  return (items || []).reduce(function (s, it) {
    return s + shipBoxCount(it);
  }, 0) || 1;
}

function upsConfigured() {
  return !!(process.env.UPS_CLIENT_ID && process.env.UPS_CLIENT_SECRET && process.env.UPS_ACCOUNT_NUMBER);
}

var ORIGIN_LOCAL = "32433";
var ORIGIN_RSC = "75418";

function isRscSku(sku) {
  var raw = String(sku || "").toUpperCase().replace(/\s+/g, "");
  if (!raw) return false;
  if (raw.indexOf("-RSC-") >= 0) return true;
  var segs = raw.split("-").filter(Boolean);
  return segs.length >= 3 && segs[2] === "RSC";
}
function cartHasRsc(items) {
  return (items || []).some(function (it) { return isRscSku(it.sku); });
}
function originZipForItems(items) {
  return cartHasRsc(items) ? ORIGIN_RSC : (process.env.UPS_ORIGIN_ZIP || ORIGIN_LOCAL);
}

function fallbackUpsGround(weightLbs, destZip, originZip) {
  var w = Math.max(1, Number(weightLbs) || 1);
  var base = 9.25;
  var perLb = w <= 10 ? 0.95 : 0.75;
  var zoneBump = 0;
  var z = String(destZip || "").replace(/\D/g, "").slice(0, 3);
  var origin = String(originZip || ORIGIN_LOCAL).replace(/\D/g, "").slice(0, 5);
  if (z) {
    var n = parseInt(z, 10);
    if (n >= 900 || (n >= 10 && n < 200)) zoneBump = 4.5;
    else if (n >= 800 || n < 300) zoneBump = 2.5;
    else if (n >= 700) zoneBump = 1.5;
    if (origin === ORIGIN_RSC && (n >= 900 || n < 200)) zoneBump += 1.25;
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
    var per = u.meta.unitsPerBox || 0;
    var packs;
    var wEach;
    if (per >= 2) {
      packs = Math.max(1, Math.ceil(qty / per) * (u.meta.packQty || 1));
      wEach = Math.max(1, Math.ceil(u.lbs * per));
    } else {
      packs = Math.max(1, (u.meta.packQty || 1) * qty);
      wEach = Math.max(1, Math.ceil(u.lbs));
    }
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

function fetchUpsGroundRate(weightLbs, destZip, items, originZip) {
  return upsToken().then(function (tok) {
    if (!tok || !tok.access_token) throw new Error("UPS token failed");
    var host = process.env.UPS_API_HOST || "onlinetools.ups.com";
    var shipper = process.env.UPS_SHIPPER_NUMBER || process.env.UPS_ACCOUNT_NUMBER;
    var fromZip = String(originZip || process.env.UPS_ORIGIN_ZIP || ORIGIN_LOCAL).replace(/\D/g, "").slice(0, 5) || ORIGIN_LOCAL;
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
  return Math.ceil(totalQuantity / 35) * 7.95;
}

function isHeavy64Sku(sku) {
  return String(sku || "").toUpperCase().replace(/\s+/g, "").endsWith("-64");
}
function cartHasHeavy64(items) {
  return (items || []).some(function (it) { return isHeavy64Sku(it.sku); });
}
function cartItemQty(items) {
  return (items || []).reduce(function (n, it) {
    return n + (Number(it.quantity) || Number(it.qty) || 1);
  }, 0);
}

async function quoteShipping(items, destZip) {
  var allItems = items || [];
  var aLines = allItems.filter(isAccessoryA);
  var nonA = allItems.filter(function (it) { return !isAccessoryA(it); });
  var aShipCost = Math.round(accessoryAShippingCost(allItems) * 100) / 100;
  var aQty = accessoryAQuantity(allItems);

  var subtotal = Math.round(cartSubtotal(allItems) * 100) / 100;
  var HANDLING = 5.0;
  var LIGHT_FLAT = 7.95;
  var FREE_MIN = 100;
  var FREE_MAX_WEIGHT = 20;

  var weightAll = Math.round(cartWeightLbs(allItems) * 100) / 100;
  var packFactor = rateMultiplierFromSkus(nonA.length ? nonA : allItems);
  var bulkLines = allItems.filter(function (it) {
    return parseSku(it.sku).fobOrigin;
  });
  var hasBulk = bulkLines.length > 0;
  var onlyBulk = hasBulk && bulkLines.length === allItems.length;

  if (onlyBulk) {
    return {
      amount: 0, method: "fob_origin",
      label: "FOB Origin — freight invoiced separately (Bulk)",
      tier: "bulk_fob", weightLbs: weightAll, subtotal: subtotal, handling: 0,
      bulk: true, fobOrigin: true, freeShipping: false, packQtyTotal: packFactor
    };
  }

  var hasHeavy64 = cartHasHeavy64(allItems);
  var itemQty = cartItemQty(allItems);

  if (subtotal >= FREE_MIN && itemQty >= 3 && !hasBulk && weightAll <= FREE_MAX_WEIGHT) {
    return {
      amount: 0, method: "free_over_100",
      label: "FREE standard shipping ($100+ and 3+ items)",
      tier: "free_over_100", weightLbs: weightAll, subtotal: subtotal, handling: 0,
      bulk: false, fobOrigin: false, freeShipping: true,
      accessoryAShipping: 0, accessoryAQty: aQty, packQtyTotal: packFactor
    };
  }

  if (itemQty < 3 && !hasBulk) {
    return {
      amount: LIGHT_FLAT, method: hasHeavy64 ? "flat_64" : "flat",
      label: hasHeavy64
        ? "Flat shipping (add items for $100+ free eligibility — 3 item minimum)"
        : "Flat shipping (light package)",
      tier: hasHeavy64 ? "heavy_64_flat" : "light_flat",
      weightLbs: weightAll, subtotal: subtotal, handling: 0,
      bulk: false, fobOrigin: false, freeShipping: false,
      accessoryAShipping: aShipCost, accessoryAQty: aQty, packQtyTotal: packFactor
    };
  }

  if (nonA.length === 0 && aLines.length > 0) {
    return {
      amount: aShipCost, method: "accessory_a_flat",
      label: "Flat shipping (light package)",
      tier: "accessory_a", weightLbs: weightAll, subtotal: subtotal, handling: 0,
      freeShipping: false, accessoryAShipping: aShipCost, accessoryAQty: aQty, packQtyTotal: aQty
    };
  }

  var retailItems = allItems.filter(function (it) { return !parseSku(it.sku).fobOrigin; });
  var retailWeight = Math.round(cartWeightLbs(retailItems) * 100) / 100;
  var retailSub = Math.round(cartSubtotal(retailItems) * 100) / 100;

  if (hasBulk && retailItems.length) {
    if (retailSub >= FREE_MIN && cartItemQty(retailItems) >= 3 && retailWeight <= FREE_MAX_WEIGHT) {
      return {
        amount: 0, method: "free_over_100_plus_fob",
        label: "FREE standard on retail lines — bulk FOB separate",
        tier: "free_over_100", weightLbs: retailWeight, subtotal: subtotal, handling: 0,
        bulk: true, fobOrigin: true, freeShipping: true, packQtyTotal: packFactor
      };
    }
    if (retailWeight <= 10) {
      return {
        amount: LIGHT_FLAT, method: "flat_plus_fob",
        label: "Flat shipping (retail) — bulk freight invoiced separate",
        tier: "light_flat", weightLbs: retailWeight, subtotal: subtotal, handling: 0,
        bulk: true, fobOrigin: true, freeShipping: false, packQtyTotal: packFactor
      };
    }
  }

  if (!hasBulk && weightAll <= 10) {
    return {
      amount: LIGHT_FLAT, method: "flat",
      label: "Flat shipping (light package)",
      tier: "light_flat", weightLbs: weightAll, subtotal: subtotal, handling: 0,
      freeShipping: false, accessoryAShipping: aShipCost, accessoryAQty: aQty, packQtyTotal: packFactor
    };
  }

  var upsRate = null;
  var source = "estimated_ups";
  var zip = destZip && String(destZip).replace(/\D/g, "").slice(0, 5);
  var rateItems = retailItems.length ? retailItems : nonA;
  var rateWeight = Math.round(cartWeightLbs(rateItems) * 100) / 100;
  var shipOrigin = originZipForItems(rateItems.length ? rateItems : allItems);
  var fromRsc = shipOrigin === ORIGIN_RSC;
  if (zip && zip.length >= 5 && upsConfigured()) {
    try {
      upsRate = await fetchUpsGroundRate(rateWeight, zip, rateItems, shipOrigin);
      source = fromRsc ? "ups_ground_rsc" : "ups_ground";
    } catch (e) {
      console.error("UPS rate error:", e.message);
    }
  }
  if (upsRate == null) {
    upsRate = fallbackUpsGround(rateWeight, zip, shipOrigin);
    source = fromRsc ? "estimated_ups_rsc" : "estimated_ups";
  }
  var amount = Math.round((Number(upsRate) + HANDLING) * 100) / 100;
  return {
    amount: amount, method: source,
    label: hasBulk ? "UPS Ground + handling (bulk FOB separate)" : "UPS Ground + handling",
    tier: "heavy", upsGround: Math.round(Number(upsRate) * 100) / 100, handling: HANDLING,
    weightLbs: rateWeight, subtotal: subtotal, bulk: hasBulk, fobOrigin: hasBulk,
    originZip: shipOrigin, rscDropship: fromRsc,
    freeShipping: false, accessoryAShipping: 0, accessoryAQty: aQty, packQtyTotal: packFactor
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
  upsConfigured,
  isAccessoryA,
  accessoryAQuantity,
  accessoryAShippingCost,
  isRscSku,
  cartHasRsc,
  originZipForItems,
  shipBoxCount,
  ORIGIN_LOCAL,
  ORIGIN_RSC
};
