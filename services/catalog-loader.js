/**
 * Apex live catalog — loads FreePort products for data-category on #apex-catalog
 */
(function () {
  var API = "https://freeport.jdwapexherp.com";

  function esc(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "\u0026amp;")
      .replace(/</g, "\u0026lt;")
      .replace(/>/g, "\u0026gt;")
      .replace(/"/g, "\u0026quot;");
  }
  function money(n) { return "$" + (Number(n) || 0).toFixed(2); }
  function absImg(u) {
    if (!u) return "";
    u = String(u).trim();
    if (!u) return "";
    if (u.indexOf("http") === 0) return u;
    if (u.charAt(0) === "/") return API + u;
    return u;
  }

  function closeAllDetails() {
    document.querySelectorAll(".apex-detail-panel").forEach(function (p) { p.classList.add("hidden"); });
    document.querySelectorAll(".apex-detail-arrow").forEach(function (a) { a.textContent = "\u25bc"; });
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
      if (arrow) arrow.textContent = "\u25b2";
    }
  };
  document.addEventListener("click", function (e) {
    if (!e.target.closest(".apex-detail-wrap")) closeAllDetails();
  });

  function card(i) {
    var qty = Number(i.qty);
    var reserved = Number(i.reserved) || 0;
    var avail = i.available;
    if (avail === undefined || avail === null) {
      avail = isNaN(qty) ? 1 : Math.max(0, qty - reserved);
    }
    avail = Number(avail);
    var soldOut = (i.status === "active" && (avail <= 0 || i.available === false));
    var disabled = i.status === "coming_soon" || i.status === "hidden" || soldOut;
    var nameSafe = String(i.name || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    var skuSafe = String(i.sku || "Standard").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    var desc = String(i.description || "").trim();
    var short = desc.length > 100 ? desc.slice(0, 100).replace(/\s+\S*$/, "") + "\u2026" : desc;
    var detailBlock;
    if (!desc) {
      detailBlock =
        '<div class="apex-detail-wrap relative mb-3 text-left">' +
        '<button type="button" onclick="event.stopPropagation();toggleApexDetails(this);" class="w-full flex items-center justify-between gap-2 rounded-lg border border-emerald-900/50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-emerald-500/90">' +
        '<span>Details</span><span class="apex-detail-arrow">\u25bc</span></button>' +
        '<div class="apex-detail-panel absolute left-0 right-0 top-full z-30 mt-1 hidden rounded-xl p-3">' +
        '<p class="text-zinc-500 text-sm">No description on file yet.</p></div></div>';
    } else {
      detailBlock =
        '<p class="text-zinc-300 text-sm leading-relaxed mb-2 px-1">' + esc(short) + "</p>" +
        '<div class="apex-detail-wrap relative mb-3 text-left">' +
        '<button type="button" onclick="event.stopPropagation();toggleApexDetails(this);" class="w-full flex items-center justify-between gap-2 rounded-lg border border-emerald-900/50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-emerald-400">' +
        '<span>Full details</span><span class="apex-detail-arrow">\u25bc</span></button>' +
        '<div class="apex-detail-panel absolute left-0 right-0 top-full z-30 mt-1 hidden max-h-48 overflow-y-auto rounded-xl p-3">' +
        '<p class="text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap">' + esc(desc) + "</p></div></div>';
    }
    var img = absImg((i.images && i.images[0]) || i.image || "");
    var media = img
      ? '<div class="h-52 rounded-xl overflow-hidden mb-4 border border-emerald-900/40 bg-zinc-950"><img src="' + esc(img) + '" alt="" class="w-full h-full object-cover" loading="lazy"></div>'
      : '<div class="h-52 rounded-xl overflow-hidden mb-4 border border-emerald-900/40 bg-zinc-950 flex items-center justify-center"><span class="text-zinc-600 text-xs uppercase">No photo</span></div>';
    var btn = soldOut || disabled
      ? '<button disabled class="w-full bg-zinc-700 text-zinc-400 font-bold uppercase text-xs py-3 rounded-xl cursor-not-allowed">' + (soldOut ? "Out of Stock" : "Unavailable") + "</button>"
      : '<button type="button" onclick="addToCart(\'' + nameSafe + "','" + skuSafe + "'," + (Number(i.price) || 0) + ')" class="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold uppercase text-xs py-3 rounded-xl">Add to Cart</button>';
    return (
      '<div class="bg-zinc-900/80 border border-emerald-900/60 rounded-2xl p-5 flex flex-col text-center relative overflow-visible">' +
      media +
      (i.category ? '<p class="text-[10px] text-zinc-500 uppercase tracking-wide mb-1">' + esc(i.category) + "</p>" : "") +
      '<h3 class="text-xl font-bold text-emerald-400 mb-2">' + esc(i.name) + "</h3>" +
      detailBlock +
      '<div class="text-2xl font-black text-white mb-1">' + money(i.price) + "</div>" +
      '<div class="mt-auto pt-4">' + btn + "</div></div>"
    );
  }

  async function loadCatalog() {
    var el = document.getElementById("apex-catalog");
    var status = document.getElementById("apex-bridge-status");
    if (!el) return;
    var cat = (el.getAttribute("data-category") || "").trim();
    if (!cat) {
      console.warn("apex-catalog missing data-category");
      return;
    }
    if (status) {
      status.textContent = "Connecting inventory\u2026";
      status.className = "text-zinc-500 text-sm mt-2";
    }
    try {
      var url = API + "/api/products?store=herp&category=" + encodeURIComponent(cat);
      var res = await fetch(url, { mode: "cors", cache: "no-store", credentials: "omit" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      var data = await res.json();
      var items = data.items || [];
      var catLower = cat.toLowerCase();
      items = items.filter(function (it) {
        return String(it.category || "").toLowerCase() === catLower;
      });
      if (!items.length) {
        el.innerHTML = '<p class="text-zinc-500 text-center col-span-full py-12">No products in ' + esc(cat) + " yet.</p>';
        if (status) {
          status.textContent = "Live \u00b7 " + cat + " \u00b7 empty";
          status.className = "text-zinc-500 text-sm mt-2";
        }
        return;
      }
      el.innerHTML = items.map(card).join("");
      if (status) {
        status.textContent = "Live \u00b7 " + cat + " \u00b7 " + items.length + " item" + (items.length === 1 ? "" : "s");
        status.className = "text-emerald-400 text-sm mt-2";
      }
    } catch (e) {
      console.warn("Catalog load failed", e);
      el.innerHTML = '<p class="text-amber-400/90 text-center col-span-full py-12">Inventory bridge offline. Check ApexFreePort node.</p>';
      if (status) {
        status.textContent = "Inventory offline";
        status.className = "text-amber-400 text-sm mt-2";
      }
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", loadCatalog);
  else loadCatalog();
})();
