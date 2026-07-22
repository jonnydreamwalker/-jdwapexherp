/** ApexFreePort bridge — multi-store (default store=herp) */
(function (global) {
  var APEX_API = "https://api.jdwapexherp.com";

  function base() {
    return (global.APEX_API_BASE || APEX_API).replace(/\/$/, "");
  }
  function storeId() {
    return global.APEX_STORE || (global.APEX_SITE && global.APEX_SITE.store) || "herp";
  }
  function imgUrl(path) {
    if (!path) return "";
    if (path.indexOf("http") === 0) return path;
    return base() + path;
  }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
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

  /** Clean card: title + price + expand description + cart */
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
            '<div class="bg-zinc-900/80 border border-emerald-900/60 rounded-2xl p-6 flex flex-col text-center">' +
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

      if (status) {
        status.textContent =
          "Live · " +
          (data.storeName || data.store || "") +
          " · " +
          items.length +
          " items";
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
    imgUrl: imgUrl,
  };

  document.addEventListener("DOMContentLoaded", function () {
    var el = document.getElementById("apex-catalog");
    if (el) {
      var cat = el.getAttribute("data-category") || "";
      renderCatalog("#apex-catalog", cat || undefined);
    }
  });
})(window);
