/** ApexFreePort bridge — live catalog for all shop pages */
(function (global) {
  var APEX_API = "https://api.jdwapexherp.com";

  function base() {
    return (global.APEX_API_BASE || APEX_API).replace(/\/$/, "");
  }

  function imgUrl(path) {
    if (!path) return "";
    if (path.indexOf("http") === 0) return path;
    return base() + path;
  }

  async function fetchProducts(category) {
    var q = category ? "?category=" + encodeURIComponent(category) : "";
    var res = await fetch(base() + "/api/products" + q, { mode: "cors", cache: "no-store" });
    if (!res.ok) throw new Error("products " + res.status);
    return res.json();
  }

  function money(n) {
    return "$" + (Number(n) || 0).toFixed(2);
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
        el.innerHTML = '<p class="text-zinc-500 text-center col-span-full py-12">No products in this category yet. Add them in ApexFreePort.</p>';
        if (status) {
          status.textContent = "Live catalog · empty";
          status.className = "text-zinc-500 text-sm mt-3";
        }
        return;
      }
      el.innerHTML = items.map(function (i) {
        var img = imgUrl(i.image);
        var imgBlock = img
          ? '<div class="h-56 bg-cover bg-center border-b border-emerald-900/50" style="background-image:url(\'' + img + '\')"></div>'
          : '<div class="h-56 bg-zinc-900 border-b border-emerald-900/50 flex items-center justify-center text-zinc-600 text-sm">No image</div>';
        var badge =
          i.status === "coming_soon"
            ? '<span class="text-amber-400 text-xs font-bold uppercase">Coming soon</span>'
            : '<span class="text-zinc-500 text-xs">Qty ' + i.qty + '</span>';
        var disabled = i.status === "coming_soon" || (i.available !== undefined && i.available <= 0);
        var btn = disabled
          ? '<button disabled class="w-full bg-zinc-700 text-zinc-400 font-bold uppercase text-xs py-4 rounded-xl cursor-not-allowed">Unavailable</button>'
          : '<button onclick="addToCart(\'' +
            String(i.name).replace(/'/g, "\\'") +
            '\',\'' +
            i.sku +
            '\',' +
            (Number(i.price) || 0) +
            ')" class="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold uppercase text-xs py-4 rounded-xl">Add to Cart</button>';
        return (
          '<div class="bg-zinc-800 border border-emerald-900 rounded-3xl overflow-hidden flex flex-col">' +
          imgBlock +
          '<div class="p-8 text-center flex-1">' +
          '<h3 class="text-2xl font-bold mb-2 text-emerald-400">' +
          i.name +
          '</h3>' +
          '<p class="text-zinc-400 mb-2 text-sm">' +
          (i.description || "") +
          '</p>' +
          '<p class="text-xs text-zinc-500 mb-2">' +
          i.sku +
          ' · ' +
          badge +
          '</p>' +
          '<div class="text-emerald-500 font-bold text-lg mb-4">' +
          money(i.price) +
          '</div></div>' +
          '<div class="p-8 pt-0">' +
          btn +
          '</div></div>'
        );
      }).join("");
      if (status) {
        status.textContent =
          "Live catalog · " + (data.warehouse || "ApexFreePort") + " · " + items.length + " items";
        status.className = "text-emerald-400 text-sm mt-3";
      }
    } catch (e) {
      console.warn("ApexBridge", e);
      el.innerHTML =
        '<p class="text-amber-400/90 text-center col-span-full py-12">Inventory bridge offline. Check ApexFreePort node.</p>';
      if (status) {
        status.textContent = "Inventory offline";
        status.className = "text-amber-400 text-sm mt-3";
      }
    }
  }

  global.ApexBridge = {
    base: base,
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
