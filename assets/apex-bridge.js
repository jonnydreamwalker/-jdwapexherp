/** ApexFreePort bridge — photos (10) + mp4 (2) + carousel */
(function (global) {
  var APEX_API = "https://api.jdwapexherp.com";

  function base() {
    return (global.APEX_API_BASE || APEX_API).replace(/\/$/, "");
  }
  function storeId() {
    return global.APEX_STORE || (global.APEX_SITE && global.APEX_SITE.store) || "herp";
  }
  function mediaUrl(path) {
    if (!path) return "";
    if (String(path).indexOf("http") === 0) return path;
    return base() + path;
  }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }
  function productImages(i) {
    var list = [];
    if (Array.isArray(i.images)) i.images.forEach(function (p) { if (p) list.push(mediaUrl(p)); });
    if (!list.length && i.image) list.push(mediaUrl(i.image));
    return list.slice(0, 10);
  }
  function productVideos(i) {
    var list = [];
    if (Array.isArray(i.videos)) i.videos.forEach(function (p) { if (p) list.push(mediaUrl(p)); });
    if (i.video) list.push(mediaUrl(i.video));
    return list.slice(0, 2);
  }
  async function fetchProducts(category) {
    var q = "?store=" + encodeURIComponent(storeId());
    if (category) q += "&category=" + encodeURIComponent(category);
    var res = await fetch(base() + "/api/products" + q, { mode: "cors", cache: "no-store" });
    if (!res.ok) throw new Error("products " + res.status);
    return res.json();
  }
  function money(n) {
    return "$" + (Number(n) || 0).toFixed(2);
  }

  function mediaBlock(imgs, vids, idx) {
    var parts = [];
    imgs.forEach(function (src) {
      parts.push({ type: "img", src: src });
    });
    vids.forEach(function (src) {
      parts.push({ type: "video", src: src });
    });
    if (!parts.length) return "";

    if (parts.length === 1 && parts[0].type === "img") {
      return (
        '<div class="h-52 rounded-xl overflow-hidden mb-4 border border-emerald-900/40 bg-zinc-950">' +
        '<img src="' + esc(parts[0].src) + '" alt="" class="w-full h-full object-cover" loading="lazy">' +
        "</div>"
      );
    }

    var slides = parts
      .map(function (p, n) {
        var inner =
          p.type === "video"
            ? '<video src="' + esc(p.src) + '" class="w-full h-full object-cover" muted playsinline loop controls></video>'
            : '<img src="' + esc(p.src) + '" alt="" class="w-full h-full object-cover" loading="lazy">';
        return (
          '<div class="apex-slide absolute inset-0 transition-opacity duration-300 ' +
          (n === 0 ? "opacity-100" : "opacity-0 pointer-events-none") +
          '" data-slide="' + n + '">' + inner + "</div>"
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
          d.className = "apex-dot w-2 h-2 rounded-full " + (i === cur ? "bg-emerald-400" : "bg-zinc-600");
        });
      }
      var prev = car.querySelector(".apex-prev");
      var next = car.querySelector(".apex-next");
      if (prev) prev.onclick = function (e) { e.preventDefault(); go(cur - 1); };
      if (next) next.onclick = function (e) { e.preventDefault(); go(cur + 1); };
      dots.forEach(function (d) {
        d.onclick = function (e) {
          e.preventDefault();
          go(Number(d.getAttribute("data-go")) || 0);
        };
      });
    });
  }

  async function renderCatalog(selector, category) {
    var el = document.querySelector(selector || "#apex-catalog");
    if (!el) return;
    var status = document.getElementById("apex-bridge-status");
    try {
      var data = await fetchProducts(category);
      global.__APEX_PRODUCTS__ = data;
      var items = data.items || [];
      if (!items.length) {
        el.innerHTML =
          '<p class="text-zinc-500 text-center col-span-full py-12">No products in this category yet.</p>';
        if (status) {
          status.textContent = "Live catalog · empty";
          status.className = "text-zinc-500 text-sm mt-3";
        }
        return;
      }
      el.innerHTML = items
        .map(function (i, idx) {
          var imgs = productImages(i);
          var vids = productVideos(i);
          var disabled =
            i.status === "coming_soon" || (i.available !== undefined && i.available <= 0);
          var desc = i.description || "";
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
          var descBlock = desc
            ? '<button type="button" class="apex-desc-toggle text-zinc-500 hover:text-emerald-400 text-xs uppercase tracking-wide mt-2" data-desc="' +
              idx +
              '">Details ▾</button>' +
              '<div id="apex-desc-' +
              idx +
              '" class="hidden text-zinc-400 text-sm mt-2 text-left leading-relaxed border-t border-zinc-800 pt-3">' +
              esc(desc) +
              "</div>"
            : "";
          return (
            '<div class="bg-zinc-900/80 border border-emerald-900/60 rounded-2xl p-5 flex flex-col text-center">' +
            mediaBlock(imgs, vids, idx) +
            '<h3 class="text-xl font-bold text-emerald-400 mb-2">' +
            esc(i.name) +
            "</h3>" +
            '<div class="text-2xl font-black text-white mb-1">' +
            money(i.price) +
            "</div>" +
            descBlock +
            '<div class="mt-auto pt-4">' +
            btn +
            "</div></div>"
          );
        })
        .join("");

      el.querySelectorAll(".apex-desc-toggle").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var id = btn.getAttribute("data-desc");
          var panel = document.getElementById("apex-desc-" + id);
          if (!panel) return;
          var open = !panel.classList.contains("hidden");
          if (open) {
            panel.classList.add("hidden");
            btn.textContent = "Details ▾";
          } else {
            panel.classList.remove("hidden");
            btn.textContent = "Details ▴";
          }
        });
      });
      wireCarousels(el);

      if (status) {
        status.textContent =
          "Live · " + (data.storeName || data.store || "") + " · " + items.length + " items";
        status.className = "text-emerald-400 text-sm mt-3";
      }
    } catch (e) {
      console.warn("ApexBridge", e);
      el.innerHTML =
        '<p class="text-amber-400/90 text-center col-span-full py-12">Inventory bridge offline. Check ApexFreePort feed for this store.</p>';
      if (status) {
        status.textContent = "Inventory offline";
        status.className = "text-amber-400 text-sm mt-3";
      }
    }
  }

  global.ApexBridge = {
    base: base,
    storeId: storeId,
    fetchProducts: fetchProducts,
    renderCatalog: renderCatalog,
    mediaUrl: mediaUrl,
  };

  document.addEventListener("DOMContentLoaded", function () {
    var el = document.getElementById("apex-catalog");
    if (el) {
      var cat = el.getAttribute("data-category") || "";
      renderCatalog("#apex-catalog", cat || undefined);
    }
  });
})(window);
