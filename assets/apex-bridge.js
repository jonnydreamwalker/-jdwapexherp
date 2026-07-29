/** ApexFreePort bridge — live catalog, category filter, up to 6 photos */
(function (global) {
  var MAX_PHOTOS = 6;
  var DEFAULTS = [
    "https://api.jdwapexherp.com",
    "https://freeport.jdwapexherp.com",
    "http://3.14.14.127:3000"
  ];

  function candidateBases() {
    var list = [];
    try {
      var ls = global.localStorage && localStorage.getItem("APEX_API_BASE");
      if (ls) list.push(String(ls).replace(/\/$/, ""));
    } catch (e) {}
    if (global.APEX_API_BASE) list.push(String(global.APEX_API_BASE).replace(/\/$/, ""));
    DEFAULTS.forEach(function (u) { list.push(u); });
    var out = [];
    list.forEach(function (u) {
      if (u && out.indexOf(u) === -1) out.push(u);
    });
    return out;
  }

  function base() {
    if (global.__APEX_API_ACTIVE__) return global.__APEX_API_ACTIVE__;
    return candidateBases()[0] || DEFAULTS[0];
  }

  function storeId() {
    return global.APEX_STORE || (global.APEX_SITE && global.APEX_SITE.store) || "herp";
  }

  function mediaUrl(path) {
    if (!path) return "";
    var s = String(path);
    if (
      s.indexOf("data:") === 0 ||
      s.indexOf("blob:") === 0 ||
      s.indexOf("http://") === 0 ||
      s.indexOf("https://") === 0
    ) {
      return s;
    }
    if (s.charAt(0) !== "/") s = "/" + s;
    return base() + s;
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&")
      .replace(/</g, "<")
      .replace(/"/g, """);
  }

  function normCat(c) {
    return String(c || "").trim().toLowerCase();
  }

  function productMedia(i) {
    var parts = [];
    var seen = {};
    function add(src, type) {
      if (!src || parts.length >= MAX_PHOTOS) return;
      var u = mediaUrl(src);
      if (!u || seen[u]) return;
      seen[u] = 1;
      parts.push({ type: type || "img", src: u });
    }
    if (Array.isArray(i.images)) i.images.forEach(function (p) { add(p, "img"); });
    if (i.image) add(i.image, "img");
    if (Array.isArray(i.videos)) {
      i.videos.forEach(function (p) { if (parts.length < MAX_PHOTOS) add(p, "video"); });
    }
    if (i.video) add(i.video, "video");
    return parts.slice(0, MAX_PHOTOS);
  }

  async function fetchFromBase(apiBase, category) {
    var q = "?store=" + encodeURIComponent(storeId());
    if (category) q += "&category=" + encodeURIComponent(category);
    var res = await fetch(apiBase + "/api/products" + q, {
      mode: "cors",
      cache: "no-store",
      credentials: "omit"
    });
    if (!res.ok) throw new Error("products " + res.status + " @ " + apiBase);
    var data = await res.json();
    if (category && Array.isArray(data.items)) {
      var want = normCat(category);
      data.items = data.items.filter(function (it) {
        return normCat(it.category) === want;
      });
    }
    return data;
  }

  async function fetchProducts(category) {
    var bases = candidateBases();
    var errors = [];
    for (var i = 0; i < bases.length; i++) {
      try {
        var data = await fetchFromBase(bases[i], category);
        global.__APEX_API_ACTIVE__ = bases[i];
        return data;
      } catch (e) {
        errors.push(String(e && e.message ? e.message : e));
      }
    }
    console.warn("ApexBridge all endpoints failed", errors);
    throw new Error(errors.join(" | ") || "bridge offline");
  }

  function money(n) {
    return "$" + (Number(n) || 0).toFixed(2);
  }

  function mediaBlock(parts, idx) {
    if (!parts.length) {
      return (
        '<div class="h-52 rounded-xl overflow-hidden mb-4 border border-emerald-900/40 bg-zinc-950 flex items-center justify-center">' +
        '<span class="text-zinc-600 text-xs uppercase tracking-wide">No photo</span></div>'
      );
    }
    if (parts.length === 1 && parts[0].type === "img") {
      return (
        '<div class="h-52 rounded-xl overflow-hidden mb-4 border border-emerald-900/40 bg-zinc-950">' +
        '<img src="' + esc(parts[0].src) + '" alt="" class="w-full h-full object-cover" loading="lazy" onerror="this.style.display=\'none\'">' +
        "</div>"
      );
    }
    var slides = parts
      .map(function (p, n) {
        var inner =
          p.type === "video"
            ? '<video src="' + esc(p.src) + '" class="w-full h-full object-cover" muted playsinline loop controls></video>'
            : '<img src="' + esc(p.src) + '" alt="" class="w-full h-full object-cover" loading="lazy" onerror="this.parentNode.style.display=\'none\'">';
        return (
          '<div class="apex-slide absolute inset-0 transition-opacity duration-300 ' +
          (n === 0 ? "opacity-100" : "opacity-0 pointer-events-none") +
          '" data-slide="' + n + '">' +
          inner +
          "</div>"
        );
      })
      .join("");
    var dots = parts
      .map(function (_, n) {
        return (
          '<button type="button" class="apex-dot w-2 h-2 rounded-full ' +
          (n === 0 ? "bg-emerald-400" : "bg-zinc-600") +
          '" data-go="' + n + '" aria-label="Media ' + (n + 1) + '"></button>'
        );
      })
      .join("");
    return (
      '<div class="apex-carousel relative h-52 rounded-xl overflow-hidden mb-4 border border-emerald-900/40 bg-zinc-950" data-car="' +
      idx +
      '">' +
      slides +
      (parts.length > 1
        ? '<button type="button" class="apex-prev absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white w-8 h-8 rounded-full text-sm z-10" aria-label="Previous">‹</button>' +
          '<button type="button" class="apex-next absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white w-8 h-8 rounded-full text-sm z-10" aria-label="Next">›</button>' +
          '<div class="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5 z-10">' +
          dots +
          "</div>"
        : "") +
      "</div>"
    );
  }

  function wireCarousels(root) {
    root.querySelectorAll(".apex-carousel").forEach(function (car) {
      var slides = car.querySelectorAll(".apex-slide");
      var dots = car.querySelectorAll(".apex-dot");
      var cur = 0;
      function go(n) {
        if (!slides.length) return;
        cur = (n + slides.length) % slides.length;
        slides.forEach(function (s, i) {
          var v = s.querySelector("video");
          if (i === cur) {
            s.classList.remove("opacity-0", "pointer-events-none");
            s.classList.add("opacity-100");
            if (v) { try { v.play(); } catch (e) {} }
          } else {
            s.classList.add("opacity-0", "pointer-events-none");
            s.classList.remove("opacity-100");
            if (v) { try { v.pause(); } catch (e) {} }
          }
        });
        dots.forEach(function (d, i) {
          d.className =
            "apex-dot w-2 h-2 rounded-full " + (i === cur ? "bg-emerald-400" : "bg-zinc-600");
        });
      }
      var prev = car.querySelector(".apex-prev");
      var next = car.querySelector(".apex-next");
      if (prev)
        prev.onclick = function (e) {
          e.preventDefault();
          go(cur - 1);
        };
      if (next)
        next.onclick = function (e) {
          e.preventDefault();
          go(cur + 1);
        };
      dots.forEach(function (d) {
        d.onclick = function (e) {
          e.preventDefault();
          go(Number(d.getAttribute("data-go")) || 0);
        };
      });
    });
  }

  function productCard(i, idx, compact) {
    var parts = productMedia(i);
    var disabled =
      i.status === "coming_soon" || (i.available !== undefined && i.available <= 0);
    var nameSafe = String(i.name).replace(/'/g, "\\'");
    var btn = disabled
      ? '<button disabled class="w-full bg-zinc-700 text-zinc-400 font-bold uppercase text-xs py-3 rounded-xl cursor-not-allowed">Unavailable</button>'
      : '<button type="button" onclick="addToCart(\'' +
        nameSafe +
        "','" +
        i.sku +
        "'," +
        (Number(i.price) || 0) +
        ')" class="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold uppercase text-xs py-3 rounded-xl">Add to Cart</button>';
    var catLink = i.category
      ? '<p class="text-[10px] text-zinc-500 uppercase tracking-wide mb-1">' +
        esc(i.category) +
        "</p>"
      : "";
    return (
      '<div class="bg-zinc-900/80 border border-emerald-900/60 rounded-2xl p-5 flex flex-col text-center ' +
      (compact ? "min-w-[260px] max-w-[280px] snap-start flex-shrink-0" : "") +
      '">' +
      mediaBlock(parts, idx) +
      catLink +
      '<h3 class="text-xl font-bold text-emerald-400 mb-2">' +
      esc(i.name) +
      "</h3>" +
      '<div class="text-2xl font-black text-white mb-1">' +
      money(i.price) +
      "</div>" +
      '<div class="mt-auto pt-4">' +
      btn +
      "</div></div>"
    );
  }

  async function renderCatalog(selector, category) {
    var el = document.querySelector(selector || "#apex-catalog");
    if (!el) return;
    var status = document.getElementById("apex-bridge-status");
    if (status) {
      status.textContent = "Connecting inventory…";
      status.className = "text-zinc-500 text-sm mt-3";
    }
    try {
      var data = await fetchProducts(category);
      global.__APEX_PRODUCTS__ = data;
      var items = data.items || [];
      if (!items.length) {
        el.innerHTML =
          '<p class="text-zinc-500 text-center col-span-full py-12">No products in this category yet.</p>';
        if (status) {
          status.textContent = "Live · " + (category || "all") + " · empty";
          status.className = "text-zinc-500 text-sm mt-3";
        }
        return;
      }
      el.innerHTML = items
        .map(function (i, idx) {
          return productCard(i, idx, false);
        })
        .join("");
      wireCarousels(el);
      if (status) {
        status.textContent =
          "Live · " +
          (category || data.store || "") +
          " · " +
          items.length +
          " item" +
          (items.length === 1 ? "" : "s");
        status.className = "text-emerald-400 text-sm mt-3";
      }
    } catch (e) {
      console.warn("ApexBridge", e);
      el.innerHTML =
        '<p class="text-amber-400/90 text-center col-span-full py-12">Inventory bridge offline. FreePort must be reachable over HTTPS (tunnel). Node is fine — the public URL is not.</p>';
      if (status) {
        status.textContent = "Inventory offline — need HTTPS tunnel to FreePort";
        status.className = "text-amber-400 text-sm mt-3";
      }
    }
  }

  async function renderHomeShowcase(selector) {
    var el = document.querySelector(selector || "#apex-home-showcase");
    if (!el) return;
    var status = document.getElementById("apex-home-status");
    try {
      var data = await fetchProducts();
      var items = (data.items || []).filter(function (i) {
        return i.status !== "hold";
      });
      if (!items.length) {
        el.innerHTML =
          '<p class="text-zinc-500 text-center w-full py-8">Catalog offline or empty — flip Herp feed live in FreePort.</p>';
        if (status) status.textContent = "Showcase empty";
        return;
      }
      el.innerHTML = items
        .map(function (i, idx) {
          return productCard(i, "h" + idx, true);
        })
        .join("");
      wireCarousels(el);
      if (status) {
        status.textContent = items.length + " products live";
        status.className = "text-emerald-400 text-sm text-center mt-4";
      }
    } catch (e) {
      console.warn("ApexBridge home", e);
      el.innerHTML =
        '<p class="text-amber-400/90 text-center w-full py-8">Inventory bridge offline.</p>';
      if (status) {
        status.textContent = "Offline";
        status.className = "text-amber-400 text-sm text-center mt-4";
      }
    }
  }

  global.ApexBridge = {
    base: base,
    storeId: storeId,
    fetchProducts: fetchProducts,
    renderCatalog: renderCatalog,
    renderHomeShowcase: renderHomeShowcase,
    mediaUrl: mediaUrl,
    candidateBases: candidateBases,
    MAX_PHOTOS: MAX_PHOTOS,
    setApiBase: function (url) {
      try {
        localStorage.setItem("APEX_API_BASE", String(url).replace(/\/$/, ""));
      } catch (e) {}
      global.APEX_API_BASE = String(url).replace(/\/$/, "");
      global.__APEX_API_ACTIVE__ = null;
    }
  };

  document.addEventListener("DOMContentLoaded", function () {
    var el = document.getElementById("apex-catalog");
    if (el) {
      var cat = el.getAttribute("data-category") || "";
      renderCatalog("#apex-catalog", cat || undefined);
    }
    if (document.getElementById("apex-home-showcase")) {
      renderHomeShowcase("#apex-home-showcase");
    }
  });
})(window);
