/** Dealer portal catalog — exclusive prices from ApexFreePort */
window.APEX_API_BASE = window.APEX_API_BASE || localStorage.getItem("APEX_API_BASE") || "https://freeport.jdwapexherp.com";

function apiBase() {
  return String(window.APEX_API_BASE || "https://freeport.jdwapexherp.com").replace(/\/$/, "");
}

function dealerHeaders() {
  var h = { "Content-Type": "application/json" };
  var t = localStorage.getItem("jdw_dealer_token");
  if (t) h["x-dealer-token"] = t;
  return h;
}

function dealerLogout() {
  localStorage.removeItem("jdw_dealer_token");
  localStorage.removeItem("jdw_dealer");
  fetch(apiBase() + "/api/wholesale/logout", { method: "POST", credentials: "include" }).catch(function () {});
  location.href = "login.html";
}

function money(n) {
  return "$" + (Number(n) || 0).toFixed(2);
}

function pricePerLb(dealer, lb, apiVal) {
  if (apiVal != null && !isNaN(Number(apiVal)) && Number(apiVal) > 0) {
    return Math.round(Number(apiVal) * 100) / 100;
  }
  var d = Number(dealer);
  var w = Number(lb);
  if (!(d > 0) || !(w > 0)) return null;
  return Math.round((d / w) * 100) / 100;
}

async function requireDealerAuth() {
  var token = localStorage.getItem("jdw_dealer_token");
  if (!token) {
    location.href = "login.html";
    return false;
  }
  try {
    var r = await fetch(apiBase() + "/api/wholesale/me", {
      headers: dealerHeaders(),
      credentials: "include"
    });
    if (!r.ok) {
      dealerLogout();
      return false;
    }
    var j = await r.json();
    if (j.dealer) localStorage.setItem("jdw_dealer", JSON.stringify(j.dealer));
    return true;
  } catch (e) {
    document.getElementById("catalog-status") &&
      (document.getElementById("catalog-status").textContent = "Cannot reach FreePort inventory bridge.");
    return false;
  }
}

async function loadDealerCatalog(category) {
  var status = document.getElementById("catalog-status");
  var grid = document.getElementById("dealer-catalog");
  if (!grid) return;
  if (status) status.textContent = "Loading dealer pricing…";
  grid.innerHTML = "";
  try {
    var q = category ? ("?category=" + encodeURIComponent(category)) : "";
    var r = await fetch(apiBase() + "/api/wholesale/catalog" + q, {
      headers: dealerHeaders(),
      credentials: "include"
    });
    if (r.status === 401) {
      dealerLogout();
      return;
    }
    var data = await r.json();
    var items = data.items || [];
    if (!items.length) {
      if (status) status.textContent = "No products in this category yet.";
      return;
    }
    if (status) {
      status.textContent =
        items.length + " SKU(s) · wholesale pricing + $/lb" + (data.warehouse ? " · " + data.warehouse : "");
    }
    items.forEach(function (item) {
      var retail = Number(item.retailPrice != null ? item.retailPrice : item.price) || 0;
      var dealer = item.dealerPrice != null && !isNaN(Number(item.dealerPrice))
        ? Number(item.dealerPrice)
        : null;
      var lb = item.weightLb != null ? Number(item.weightLb) : null;
      var perLb = pricePerLb(dealer, lb, item.pricePerLb);
      var avail = item.available != null ? item.available : Math.max(0, (item.qty || 0) - (item.reserved || 0));
      var img = item.image
        ? (item.image.indexOf("http") === 0 ? item.image : apiBase() + item.image)
        : "../assets/images/gallery/Logo.png";

      var priceBlock = "";
      if (dealer != null && dealer > 0) {
        priceBlock =
          '<p class="text-emerald-400 text-xl font-black">' + money(dealer) +
          ' <span class="text-[10px] font-semibold text-emerald-600/80">WHOLESALE</span></p>';
        if (perLb != null) {
          priceBlock +=
            '<p class="text-amber-400 text-sm font-bold mt-1">' + money(perLb) +
            ' <span class="text-[10px] font-semibold text-amber-500/90">/ lb</span></p>';
        }
        if (lb != null && lb > 0) {
          priceBlock +=
            '<p class="text-[11px] text-zinc-500 mt-0.5">' + lb + " lb lot" +
            (perLb != null ? " · " + money(dealer) + " ÷ " + lb + " lb" : "") + "</p>";
        }
        if (retail > 0 && retail !== dealer) {
          priceBlock += '<p class="text-xs text-zinc-600 line-through mt-1">List $' + retail.toFixed(2) + "</p>";
        }
      } else {
        priceBlock =
          '<p class="text-zinc-400 text-sm font-bold">Wholesale price not set</p>' +
          (retail > 0 ? '<p class="text-xs text-zinc-600">List $' + retail.toFixed(2) + "</p>" : "");
      }

      var card = document.createElement("div");
      card.className = "bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden flex flex-col";
      card.innerHTML =
        '<div class="h-40 bg-zinc-950 bg-cover bg-center" style="background-image:url(\'' +
        img.replace(/'/g, "%27") +
        "')\"></div>" +
        '<div class="p-5 flex-1 flex flex-col">' +
        '<p class="text-[10px] uppercase tracking-wider text-zinc-500">' +
        (item.category || "") +
        " · " +
        (item.sku || "") +
        "</p>" +
        '<h3 class="font-bold text-lg mt-1 mb-2">' +
        (item.name || "Product") +
        "</h3>" +
        '<p class="text-xs text-zinc-500 mb-4 line-clamp-2">' +
        (item.description || "") +
        "</p>" +
        '<div class="mt-auto flex items-end justify-between gap-3">' +
        "<div>" + priceBlock + "</div>" +
        '<p class="text-xs ' +
        (avail > 0 ? "text-zinc-400" : "text-amber-500") +
        '">' +
        (avail > 0 ? avail + " avail" : "Contact for stock") +
        "</p>" +
        "</div></div>";
      grid.appendChild(card);
    });
  } catch (e) {
    if (status) status.textContent = "Inventory bridge offline. Check ApexFreePort node.";
  }
}
