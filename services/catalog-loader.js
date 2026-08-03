/**
 * Apex live catalog — FreePort products for #apex-catalog[data-category]
 */
(function () {
  var API = "https://freeport.jdwapexherp.com";

  function esc(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "\x26amp;")
      .replace(/</g, "\x26lt;")
      .replace(/>/g, "\x26gt;")
      .replace(/"/g, "\x26quot;");
  }
  function money(n) {
    return "$" + (Number(n) || 0).toFixed(2);
  }
  function absImg(u) {
    if (!u) return "";
    u = String(u).trim();
    if (!u) return "";
    if (u.indexOf("http") === 0) return u;
    if (u.charAt(0) === "/") return API + u;
    return u;
  }
  function normCat(s) {
    return String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
  }
  function catMatch(itemCat, want) {
    var a = normCat(itemCat);
    var b = normCat(want);
    if (!b) return true;
    if (a === b) return true;
    var plant = ["live plants", "live plant", "plants", "plant"];
    if (plant.indexOf(b) >= 0 && plant.indexOf(a) >= 0) return true;
    return false;
  }

  function closeAllDetails() {
    document.querySelectorAll(".apex-detail-panel").forEach(function (p) {
      p.classList.add("hidden");
    });
    document.querySelectorAll(".apex-detail-arrow").forEach(function (a) {
      a.textContent = "v";
    });
  }
  window.toggleApexDetails = function (btn) {
    var wrap = btn.closest(".apex-detail-wrap");
    if (!wrap) return;
    var panel = wrap.querySelector(".apex-detail-panel");
    var arrow = wrap.querySelector(".apex-detail-arrow");
    if (!panel) return;
    var opening = panel.classList.contains("hidden");
    closeAllDetails();
    if (opening) {
      panel.classList.remove("hidden");
      if (arrow) arrow.textContent = "^";
    }
  };
  document.addEventListener("click", function (e) {
    if (!e.target.closest(".apex-detail-wrap")) closeAllDetails();
  });

  document.addEventListener("click", function (e) {
    var btn = e.target.closest(".apex-add-to-cart");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    var name = btn.getAttribute("data-name") || "";
    var sku = btn.getAttribute("data-sku") || "Standard";
    var price = Number(btn.getAttribute("data-price")) || 0;
    if (typeof window.addToCart === "function") {
      window.addToCart(name, sku, price);
    } else {
      console.error("addToCart missing — check nav-shell.js");
      alert("Cart is loading. Please refresh and try again.");
    }
  });

  function card(i) {
    var avail = i.available;
    if (avail === undefined || avail === null) {
      var qty = Number(i.qty);
      var reserved = Number(i.reserved) || 0;
      avail = isNaN(qty) ? 1 : Math.max(0, qty - reserved);
    }
    avail = Number(avail);
    var isPreorder = i.preorder === true || i.preorder === "true" || i.preorder === 1;
    var soldOut = i.status === "active" && (avail <= 0 || i.available === false) && !isPreorder;
    var disabled = (i.status === "coming_soon" && !isPreorder) || i.status === "hidden" || soldOut;
    var nameSafe = String(i.name || "")
      .replace(/&/g, "\x26amp;")
      .replace(/"/g, "\x26quot;")
      .replace(/'/g, "\x26#39;");
    var skuSafe = String(i.sku || "Standard")
      .replace(/&/g, "\x26amp;")
      .replace(/"/g, "\x26quot;")
      .replace(/'/g, "\x26#39;");
    var desc = String(i.description || "").trim();
    var short = desc.length > 100 ? desc.slice(0, 100).replace(/\s+\S*$/, "") + "..." : desc;
    var detailBlock;
    if (!desc) {
      detailBlock =
        '<div class="apex-detail-wrap relative mb-3 text-left">' +
        '<button type="button" onclick="event.stopPropagation();toggleApexDetails(this);" class="w-full flex items-center justify-between gap-2 rounded-lg border border-emerald-900/50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-emerald-500/90">' +
        '<span>Details</span><span class="apex-detail-arrow">v</span></button>' +
        '<div class="apex-detail-panel absolute left-0 right-0 top-full z-30 mt-1 hidden rounded-xl p-3 bg-zinc-950 border border-emerald-900/40">' +
        '<p class="text-zinc-500 text-sm">No description on file yet.</p></div></div>';
    } else {
      detailBlock =
        '<p class="text-zinc-300 text-sm leading-relaxed mb-2 px-1">' + esc(short) + "</p>" +
        '<div class="apex-detail-wrap relative mb-3 text-left">' +
        '<button type="button" onclick="event.stopPropagation();toggleApexDetails(this);" class="w-full flex items-center justify-between gap-2 rounded-lg border border-emerald-900/50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-emerald-400">' +
        '<span>Full details</span><span class="apex-detail-arrow">v</span></button>' +
        '<div class="apex-detail-panel absolute left-0 right-0 top-full z-30 mt-1 hidden max-h-48 overflow-y-auto rounded-xl p-3 bg-zinc-950 border border-emerald-900/40">' +
        '<p class="text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap">' + esc(desc) + "</p></div></div>";
    }
    var img = absImg((i.images && i.images[0]) || i.image || "");
    var media;
    if (img) {
      media =
        '<div class="h-52 rounded-xl overflow-hidden mb-4 border border-emerald-900/40 bg-zinc-950">' +
        '<img src="' + esc(img) + '" alt="" class="w-full h-full object-cover" loading="lazy"></div>';
    } else {
      media =
        '<div class="h-52 rounded-xl overflow-hidden mb-4 border border-emerald-900/40 bg-zinc-950 flex items-center justify-center">' +
        '<span class="text-zinc-600 text-xs uppercase">No photo</span></div>';
    }
    var btn;
    if (soldOut || disabled) {
      btn =
        '<button disabled class="w-full bg-zinc-700 text-zinc-400 font-bold uppercase text-xs py-3 rounded-xl cursor-not-allowed">' +
        (soldOut ? "Out of Stock" : "Unavailable") +
        "</button>";
    } else {
      var cartLabel = isPreorder && avail <= 0 ? "Preorder" : "Add to Cart";
      var cartClass = isPreorder && avail <= 0
        ? "apex-add-to-cart w-full bg-sky-600 hover:bg-sky-500 text-white font-bold uppercase text-xs py-3 rounded-xl"
        : "apex-add-to-cart w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold uppercase text-xs py-3 rounded-xl";
      btn =
        '<button type="button" class="' + cartClass + '" data-name="' +
        nameSafe +
        '" data-sku="' +
        skuSafe +
        '" data-price="' +
        (Number(i.price) || 0) +
        '">' + cartLabel + '</button>';
    }
    return (
      '<div class="bg-zinc-900/80 border border-emerald-900/60 rounded-2xl p-5 flex flex-col text-center relative overflow-visible">' +
      media +
      (i.category
        ? '<p class="text-[10px] text-zinc-500 uppercase tracking-wide mb-1">' + esc(i.category) + "</p>"
        : "") +
      '<h3 class="text-xl font-bold text-emerald-400 mb-2">' +
      esc(i.name) +
      "</h3>" +
      (isPreorder
        ? '<p class="text-[10px] font-bold uppercase tracking-wide text-sky-400 mb-2">Preorder — ships when stock arrives</p>'
        : "") +
      detailBlock +
      '<div class="text-2xl font-black text-white mb-1">' +
      money(i.price) +
      "</div>" +
      '<div class="mt-auto pt-4">' +
      btn +
      "</div></div>"
    );
  }

  async function loadCatalog() {
    var el = document.getElementById("apex-catalog");
    var status = document.getElementById("apex-bridge-status");
    if (!el) return;
    var cat = (el.getAttribute("data-category") || "").trim();
    if (!cat) return;
    if (status) {
      status.textContent = "Connecting inventory...";
      status.className = "text-zinc-500 text-sm mt-2";
    }
    try {
      var url = API + "/api/products?store=herp&category=" + encodeURIComponent(cat);
      var res = await fetch(url, { mode: "cors", cache: "no-store", credentials: "omit" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      var data = await res.json();
      var items = (data.items || []).filter(function (it) {
        return catMatch(it.category, cat);
      });
      if (!items.length) {
        var res2 = await fetch(API + "/api/products?store=herp", {
          mode: "cors",
          cache: "no-store",
          credentials: "omit"
        });
        if (res2.ok) {
          var data2 = await res2.json();
          items = (data2.items || []).filter(function (it) {
            return catMatch(it.category, cat);
          });
        }
      }
      if (!items.length) {
        el.innerHTML =
          '<p class="text-zinc-500 text-center col-span-full py-12">No products in <span class="text-emerald-400">' +
          esc(cat) +
          "</span> yet. Add them in ApexFreePort with this exact category name.</p>";
        if (status) {
          status.textContent = "Live · " + cat + " · empty";
          status.className = "text-zinc-500 text-sm mt-2";
        }
        return;
      }
      el.innerHTML = items.map(card).join("");
      if (status) {
        status.textContent =
          "Live · " + cat + " · " + items.length + " item" + (items.length === 1 ? "" : "s");
        status.className = "text-emerald-400 text-sm mt-2";
      }
    } catch (e) {
      console.warn("[Apex] catalog failed", e);
      el.innerHTML =
        '<p class="text-amber-400/90 text-center col-span-full py-12">Inventory bridge offline. Check ApexFreePort node.</p>';
      if (status) {
        status.textContent = "Inventory offline";
        status.className = "text-amber-400 text-sm mt-2";
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadCatalog);
  } else {
    loadCatalog();
  }
})();
