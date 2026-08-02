/** Dealer portal catalog — exclusive prices + cart (Stripe/PayPal via FreePort) */
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
  fetch(apiBase() + "/api/wholesale/logout", { method: "POST" }).catch(function () {});
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

/* Dealer cart (separate from public jdw_cart) */
function getDealerCart() {
  try {
    return JSON.parse(localStorage.getItem("jdw_dealer_cart") || "[]") || [];
  } catch (e) {
    return [];
  }
}
function saveDealerCart(cart) {
  localStorage.setItem("jdw_dealer_cart", JSON.stringify(cart || []));
  updateDealerCartCount();
}
function clearDealerCart() {
  saveDealerCart([]);
}
function updateDealerCartCount() {
  var cart = getDealerCart();
  var n = cart.reduce(function (s, i) {
    return s + (Number(i.quantity) || 0);
  }, 0);
  document.querySelectorAll(".dealer-cart-count").forEach(function (el) {
    el.innerText = String(n);
  });
}
function addDealerCartItem(item) {
  var price = Number(item.price);
  if (!(price > 0)) {
    alert("Wholesale price not set for this SKU.");
    return;
  }
  var cart = getDealerCart();
  var sku = String(item.sku || "");
  var hit = cart.find(function (c) {
    return c.sku === sku;
  });
  if (hit) {
    hit.quantity = (Number(hit.quantity) || 0) + 1;
  } else {
    cart.push({
      sku: sku,
      name: item.name || sku,
      price: price,
      quantity: 1,
      weightLb: item.weightLb || null
    });
  }
  saveDealerCart(cart);
  updateDealerCartCount();
}
function removeDealerCartItem(idx) {
  var cart = getDealerCart();
  cart.splice(idx, 1);
  saveDealerCart(cart);
  openDealerCartModal();
}
function openDealerCartModal() {
  var cart = getDealerCart();
  var list = document.getElementById("dealer-cart-items");
  var totalEl = document.getElementById("dealer-cart-total");
  var modal = document.getElementById("dealer-cart-modal");
  if (!list || !totalEl || !modal) return;
  list.innerHTML = "";
  if (!cart.length) {
    list.innerHTML = '<p class="text-zinc-500 text-center py-8">Dealer cart is empty.</p>';
    totalEl.innerText = "$0.00";
  } else {
    var total = 0;
    cart.forEach(function (item, i) {
      var line = (Number(item.price) || 0) * (Number(item.quantity) || 1);
      total += line;
      list.innerHTML +=
        '<div class="flex justify-between items-center bg-zinc-950 border border-zinc-800 p-4 rounded-xl gap-3">' +
        '<div class="min-w-0">' +
        '<h4 class="font-bold truncate">' +
        (item.name || item.sku) +
        "</h4>" +
        '<p class="text-xs text-emerald-400">' +
        money(item.price) +
        " × " +
        item.quantity +
        (item.sku ? ' · <span class="text-zinc-500">' + item.sku + "</span>" : "") +
        "</p></div>" +
        '<button type="button" onclick="removeDealerCartItem(' +
        i +
        ')" class="text-red-400 shrink-0"><i class="fas fa-trash-alt"></i></button></div>';
    });
    totalEl.innerText = money(total);
  }
  modal.classList.remove("hidden");
  modal.classList.add("flex");
}
function closeDealerCartModal() {
  var modal = document.getElementById("dealer-cart-modal");
  if (!modal) return;
  modal.classList.add("hidden");
  modal.classList.remove("flex");
}

function dealerCartPayload() {
  return getDealerCart().map(function (i) {
    return {
      name: i.name,
      sku: i.sku,
      price: Number(i.price) || 0,
      quantity: Number(i.quantity) || 1
    };
  });
}

function startDealerCheckout(path, label) {
  var items = dealerCartPayload();
  if (!items.length) {
    alert("Your dealer cart is empty.");
    return;
  }
  var token = localStorage.getItem("jdw_dealer_token");
  if (!token) {
    location.href = "login.html";
    return;
  }
  fetch(apiBase() + path, {
    method: "POST",
    headers: dealerHeaders(),
    body: JSON.stringify({
      items: items,
      successUrl: location.origin + location.pathname + "?paid=1",
      cancelUrl: location.href,
      channel: "wholesale",
      dealer: true
    })
  })
    .then(function (r) {
      return r.json().then(function (j) {
        return { ok: r.ok, j: j };
      });
    })
    .then(function (x) {
      if (x.ok && x.j && x.j.url) {
        window.location.href = x.j.url;
        return;
      }
      alert((x.j && (x.j.message || x.j.error)) || label + " is not available right now.");
      console.error(label, x);
    })
    .catch(function (e) {
      alert(label + " could not reach FreePort. Check the inventory bridge.");
      console.error(e);
    });
}
function dealerCheckoutStripe() {
  startDealerCheckout("/api/checkout/stripe", "Stripe");
}
function dealerCheckoutPayPal() {
  startDealerCheckout("/api/checkout/paypal", "PayPal");
}

function handleDealerPaidReturn() {
  try {
    var q = new URLSearchParams(window.location.search || "");
    if (!q.get("paid")) return;
    clearDealerCart();
    if (window.history && window.history.replaceState) {
      window.history.replaceState({}, document.title, window.location.pathname + (window.location.hash || ""));
    }
    if (!window.__dealerPaidToast) {
      window.__dealerPaidToast = true;
      setTimeout(function () {
        try {
          alert("Payment received — thank you. Dealer cart cleared.");
        } catch (e) {}
      }, 200);
    }
  } catch (e) {
    console.error("dealer paid return", e);
  }
}

async function requireDealerAuth() {
  var token = localStorage.getItem("jdw_dealer_token");
  if (!token) {
    location.href = "login.html";
    return false;
  }
  try {
    var r = await fetch(apiBase() + "/api/wholesale/me", {
      headers: dealerHeaders()
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
    var q = category ? "?category=" + encodeURIComponent(category) : "";
    var r = await fetch(apiBase() + "/api/wholesale/catalog" + q, {
      headers: dealerHeaders()
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
      var dealer = item.dealerPrice != null && !isNaN(Number(item.dealerPrice)) ? Number(item.dealerPrice) : null;
      var lb = item.weightLb != null ? Number(item.weightLb) : null;
      var perLb = pricePerLb(dealer, lb, item.pricePerLb);
      var avail =
        item.available === true ||
        item.available === 1 ||
        (typeof item.available === "number" && item.available > 0);
      var img = item.image
        ? item.image.indexOf("http") === 0
          ? item.image
          : apiBase() + item.image
        : "../assets/images/gallery/Logo.png";

      var mainPrice = "";
      if (dealer != null && dealer > 0) {
        mainPrice =
          '<p class="text-emerald-400 text-xl font-black leading-tight">' +
          money(dealer) +
          ' <span class="text-[10px] font-semibold text-emerald-600/80">WHOLESALE</span></p>';
      } else {
        mainPrice = '<p class="text-zinc-400 text-sm font-bold">Wholesale price not set</p>';
      }

      var detailRows = "";
      if (item.description) {
        detailRows +=
          '<p class="text-xs text-zinc-400 mb-2">' +
          String(item.description).replace(/</g, "<") +
          "</p>";
      }
      if (perLb != null) {
        detailRows +=
          '<p class="text-amber-400 text-sm font-bold">' +
          money(perLb) +
          ' <span class="text-[10px] font-semibold text-amber-500/90">/ lb</span></p>';
      }
      if (lb != null && lb > 0) {
        detailRows +=
          '<p class="text-[11px] text-zinc-500 mt-0.5">' +
          lb +
          " lb lot" +
          (perLb != null && dealer ? " · " + money(dealer) + " ÷ " + lb + " lb" : "") +
          "</p>";
      }
      if (retail > 0 && (dealer == null || retail !== dealer)) {
        detailRows +=
          '<p class="text-xs text-zinc-600 line-through mt-1">List $' +
          retail.toFixed(2) +
          "</p>";
      }
      if (!detailRows) {
        detailRows = '<p class="text-xs text-zinc-600">No extra details</p>';
      }

      var canBuy = dealer != null && dealer > 0;
      var card = document.createElement("div");
      card.className = "bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden flex flex-col";
      card.innerHTML =
        '<div class="bg-zinc-950 w-full">' +
        '<img src="' +
        encodeURI(String(img)) +
        '" alt="" class="w-full h-auto max-h-80 object-contain mx-auto block" loading="lazy" />' +
        "</div>" +
        '<div class="p-4 flex-1 flex flex-col gap-2">' +
        '<p class="text-[10px] uppercase tracking-wider text-zinc-500">' +
        (item.category || "") +
        " · " +
        (item.sku || "") +
        "</p>" +
        '<h3 class="font-bold text-base leading-snug">' +
        (item.name || "Product") +
        "</h3>" +
        '<div class="flex items-center justify-between gap-2">' +
        "<div>" +
        mainPrice +
        "</div>" +
        '<p class="text-[11px] shrink-0 ' +
        (avail ? "text-emerald-500/80" : "text-amber-500") +
        '">' +
        (avail ? "In stock" : "Contact") +
        "</p></div>" +
        '<details class="group rounded-xl border border-zinc-800 bg-zinc-950/80">' +
        '<summary class="cursor-pointer list-none px-3 py-2 text-[11px] uppercase tracking-wider text-zinc-400 flex items-center justify-between select-none">' +
        "<span>Details</span>" +
        '<i class="fas fa-chevron-down text-[10px] text-zinc-600 group-open:rotate-180 transition-transform"></i>' +
        "</summary>" +
        '<div class="px-3 pb-3 border-t border-zinc-800/80 pt-2">' +
        detailRows +
        "</div></details>" +
        '<div class="mt-auto pt-1">' +
        (canBuy
          ? '<button type="button" class="w-full bg-emerald-600 hover:bg-emerald-500 text-black font-bold text-xs uppercase tracking-wider py-2.5 rounded-xl dealer-add-btn">Add to dealer cart</button>'
          : '<button type="button" disabled class="w-full bg-zinc-800 text-zinc-500 font-bold text-xs uppercase tracking-wider py-2.5 rounded-xl cursor-not-allowed">Price required</button>') +
        "</div></div>";
      if (canBuy) {
        var btn = card.querySelector(".dealer-add-btn");
        btn.addEventListener("click", function () {
          addDealerCartItem({
            sku: item.sku,
            name: item.name,
            price: dealer,
            weightLb: lb
          });
        });
      }
      grid.appendChild(card);
    });
  } catch (e) {
    if (status) status.textContent = "Inventory bridge offline. Check ApexFreePort node.";
  }
}

window.dealerLogout = dealerLogout;
window.openDealerCartModal = openDealerCartModal;
window.closeDealerCartModal = closeDealerCartModal;
window.removeDealerCartItem = removeDealerCartItem;
window.dealerCheckoutStripe = dealerCheckoutStripe;
window.dealerCheckoutPayPal = dealerCheckoutPayPal;
window.clearDealerCart = clearDealerCart;
window.requireDealerAuth = requireDealerAuth;
window.loadDealerCatalog = loadDealerCatalog;
window.updateDealerCartCount = updateDealerCartCount;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", function () {
    handleDealerPaidReturn();
    updateDealerCartCount();
  });
} else {
  handleDealerPaidReturn();
  updateDealerCartCount();
}
