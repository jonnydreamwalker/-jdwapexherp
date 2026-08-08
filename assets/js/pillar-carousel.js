/**
 * Homepage category carousels — FreePort category photo pools.
 * Weekly shuffle of up to 5 category product photos. Logo pad when empty.
 * Aliases: Plants ↔ Live Plants, etc. Does not touch checkout.
 */
(function () {
  var API = "https://freeport.jdwapexherp.com";
  var MAX = 5;
  var LOGO = "assets/images/gallery/Logo.png";
  var CACHE_VER = "v4";

  var SKU_PREFIX = {
    "HS-": "Hardscape",
    "LT-": "Lighting",
    "SB-": "Substrates",
    "AP-": "Apparel",
    "NT-": "Nutrition",
    "NU-": "Nutrition",
    "HT-": "Heating",
    "HE-": "Heating",
    "EN-": "Enclosures",
    "HW-": "Hardware",
    "PL-": "Plants"
  };

  function weekKey() {
    var d = new Date();
    var t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    var dayNum = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - dayNum);
    var yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    var week = Math.ceil((((t - yearStart) / 86400000) + 1) / 7);
    return t.getUTCFullYear() + "-W" + week;
  }

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashStr(s) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function normCat(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  var CAT_ALIASES = {
    plants: ["plants", "live plants", "live plant", "plant"],
    "live plants": ["plants", "live plants", "live plant", "plant"],
    heating: ["heating", "heating and basking", "heating basking", "basking"],
    "heating and basking": ["heating", "heating and basking", "basking"],
    hardware: ["hardware", "fixtures", "equipment"],
    enclosures: ["enclosures", "enclosure", "vivarium", "vivariums"],
    apparel: ["apparel", "gear", "clothing"],
    nutrition: ["nutrition", "supplements", "vitamins"],
    hardscape: ["hardscape", "cork", "wood"],
    lighting: ["lighting", "uvb", "lights"],
    substrates: ["substrates", "substrate", "bedding"]
  };

  function exactCat(itemCat, want) {
    var a = normCat(itemCat);
    var b = normCat(want);
    if (!b) return false;
    if (a === b) return true;
    var aliases = CAT_ALIASES[b] || CAT_ALIASES[a];
    if (aliases && aliases.indexOf(a) >= 0 && aliases.indexOf(b) >= 0) return true;
    if (aliases && aliases.indexOf(a) >= 0) return true;
    if (a && b && (a.indexOf(b) >= 0 || b.indexOf(a) >= 0) && Math.min(a.length, b.length) >= 5) return true;
    return false;
  }

  function skuBelongs(sku, want) {
    var s = String(sku || "").toUpperCase();
    for (var prefix in SKU_PREFIX) {
      if (s.indexOf(prefix) === 0) {
        return exactCat(SKU_PREFIX[prefix], want);
      }
    }
    return null;
  }

  function itemBelongs(it, want) {
    if (!exactCat(it.category, want)) return false;
    var skuOk = skuBelongs(it.sku, want);
    if (skuOk === false) return false;
    return true;
  }

  function padTo(list, n) {
    var out = (list || []).slice();
    while (out.length < n) out.push(LOGO);
    return out.slice(0, n);
  }

  function pickWeekly(urls, n, cat) {
    var key = "apex_car_" + CACHE_VER + "_" + cat + "_" + weekKey();
    try {
      var cached = localStorage.getItem(key);
      if (cached) {
        var parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length) return padTo(parsed.slice(0, n), n);
      }
    } catch (e) {}
    var pool = urls.slice();
    var rnd = mulberry32(hashStr(key + "|" + pool.join("|")));
    for (var i = pool.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var tmp = pool[i];
      pool[i] = pool[j];
      pool[j] = tmp;
    }
    var chosen = pool.slice(0, Math.min(n, pool.length));
    chosen = padTo(chosen, n);
    try {
      localStorage.setItem(key, JSON.stringify(chosen));
    } catch (e) {}
    return chosen;
  }

  function absUrl(u) {
    if (!u) return "";
    u = String(u).trim();
    if (!u) return "";
    if (u.indexOf("undefined") >= 0) return "";
    if (u.indexOf("http") === 0) return u;
    if (u.charAt(0) === "/") return API + u;
    return u;
  }

  function collectImages(items, cat) {
    var out = [];
    var seen = {};
    function add(u) {
      u = absUrl(u);
      if (!u || seen[u]) return;
      if (u.indexOf("Logo.png") >= 0 || u.indexOf("logo.png") >= 0) return;
      seen[u] = 1;
      out.push(u);
    }
    (items || []).forEach(function (it) {
      if (!itemBelongs(it, cat)) return;
      if (Array.isArray(it.images)) it.images.forEach(add);
      if (it.image) add(it.image);
      if (it.photo) add(it.photo);
      if (Array.isArray(it.photos)) it.photos.forEach(add);
    });
    return out;
  }

  function initCarousel(root) {
    var slides = root.querySelectorAll("img[data-slide]");
    var dots = root.querySelectorAll(".dot");
    if (!slides.length) return;
    var i = 0, timer = null, paused = false;
    function show(n) {
      i = (n + slides.length) % slides.length;
      slides.forEach(function (s, x) { s.classList.toggle("is-active", x === i); });
      dots.forEach(function (d, x) { d.classList.toggle("is-active", x === i); });
      var next = slides[(i + 1) % slides.length];
      if (next && next.getAttribute("data-src") && !next.getAttribute("src")) {
        next.setAttribute("src", next.getAttribute("data-src"));
      }
    }
    function tick() { if (!paused) show(i + 1); }
    function start() { if (slides.length > 1) timer = setInterval(tick, 4200); }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }
    dots.forEach(function (d, x) {
      d.addEventListener("click", function () { show(x); stop(); start(); });
    });
    root.addEventListener("mouseenter", function () { paused = true; });
    root.addEventListener("mouseleave", function () { paused = false; });
    show(0);
    start();
  }

  function render(root, urls, cat) {
    urls = padTo(urls || [], MAX);
    root.innerHTML = "";
    var dots = document.createElement("div");
    dots.className = "dots";
    urls.forEach(function (u, idx) {
      var img = document.createElement("img");
      img.setAttribute("data-slide", "");
      img.alt = cat || "Product";
      img.decoding = "async";
      if (idx === 0) {
        img.className = "is-active";
        img.src = u;
        img.setAttribute("fetchpriority", "high");
      } else if (idx === 1) {
        img.src = u;
        img.loading = "lazy";
      } else {
        img.setAttribute("data-src", u);
        img.loading = "lazy";
      }
      img.onerror = function () { this.onerror = null; this.src = LOGO; };
      root.appendChild(img);
      var dot = document.createElement("button");
      dot.type = "button";
      dot.className = idx === 0 ? "dot is-active" : "dot";
      dot.setAttribute("aria-label", "Slide " + (idx + 1));
      dots.appendChild(dot);
    });
    root.appendChild(dots);
    initCarousel(root);
  }

  async function loadCategory(root) {
    var cat = (root.getAttribute("data-category") || "").trim();
    if (!cat) {
      render(root, [], "Product");
      return;
    }
    try {
      var res = await fetch(
        API + "/api/products?store=herp&category=" + encodeURIComponent(cat),
        { mode: "cors", cache: "no-store", credentials: "omit" }
      );
      if (!res.ok) throw new Error("http " + res.status);
      var data = await res.json();
      var items = data.items || data.products || [];
      if (!items.length) {
        var res2 = await fetch(API + "/api/products?store=herp", {
          mode: "cors",
          cache: "no-store",
          credentials: "omit"
        });
        if (res2.ok) {
          var data2 = await res2.json();
          items = data2.items || data2.products || [];
        }
      }
      var imgs = collectImages(items, cat);
      var chosen = pickWeekly(imgs, MAX, cat);
      render(root, chosen, cat);
    } catch (e) {
      console.warn("carousel " + cat, e);
      render(root, [], cat);
    }
  }

  try {
    Object.keys(localStorage).forEach(function (k) {
      if (k.indexOf("apex_car_") === 0 && k.indexOf("apex_car_" + CACHE_VER + "_") !== 0) {
        localStorage.removeItem(k);
      }
    });
  } catch (e) {}

  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll("[data-carousel]").forEach(function (root) {
      loadCategory(root);
    });
  });
})();
