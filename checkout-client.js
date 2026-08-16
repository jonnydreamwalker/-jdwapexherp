/** Apex cart checkout — Stripe + PayPal via FreePort */
window.APEX_API_BASE = window.APEX_API_BASE || "https://freeport.jdwapexherp.com";

function apexCartPayload() {
  var cart = JSON.parse(localStorage.getItem("jdw_cart") || "[]") || [];
  return cart.map(function (i) {
    return {
      name: i.name,
      sku: i.sku,
      price: Number(i.price) || 0,
      quantity: Number(i.quantity) || 1,
      preorder: !!i.preorder
    };
  });
}

function clearApexCart() {
  try {
    localStorage.setItem("jdw_cart", JSON.stringify([]));
  } catch (e) {}
  if (typeof updateCartCount === "function") {
    try { updateCartCount(); } catch (e2) {}
  }
  document.querySelectorAll(".cart-count").forEach(function (b) {
    b.innerText = "0";
  });
}

function handlePaidReturn() {
  try {
    var q = new URLSearchParams(window.location.search || "");
    if (!q.get("paid")) return;
    clearApexCart();
    if (window.history && window.history.replaceState) {
      window.history.replaceState({}, document.title, window.location.pathname + (window.location.hash || ""));
    }
    if (!window.__apexPaidToast) {
      window.__apexPaidToast = true;
      setTimeout(function () {
        try { alert("Payment received — thank you. Your cart has been cleared."); } catch (e) {}
      }, 200);
    }
  } catch (e) {
    console.error("paid return", e);
  }
}

function startCheckout(path, label) {
  var items = apexCartPayload();
  if (!items.length) {
    alert("Your cart is empty.");
    return;
  }
  var base = window.APEX_API_BASE || "https://freeport.jdwapexherp.com";
  fetch(base + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items: items,
      successUrl: location.origin + location.pathname + "?paid=1",
      cancelUrl: location.href
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

function startStripePayment() {
  startCheckout("/api/checkout/stripe", "Stripe");
}
function checkoutStripe() {
  startStripePayment();
}
function startPayPalPayment() {
  startCheckout("/api/checkout/paypal", "PayPal");
}
function startSquarePayment() {
  alert("Square is offline. Use Stripe or PayPal.");
}
function populatePayPalFormFields() {
  startPayPalPayment();
  return false;
}

window.startStripePayment = startStripePayment;
window.checkoutStripe = checkoutStripe;
window.startPayPalPayment = startPayPalPayment;
window.startSquarePayment = startSquarePayment;
window.clearApexCart = clearApexCart;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", handlePaidReturn);
} else {
  handlePaidReturn();
}

function ensureShippingExplainer() {
  if (document.getElementById("apex-ship-explain")) return;
  var modal = document.getElementById("cart-modal");
  if (!modal) return;
  var box = document.createElement("div");
  box.id = "apex-ship-explain";
  box.className = "mt-4";
  box.innerHTML =
    '<button type="button" id="apex-ship-toggle" class="w-full flex items-center justify-between gap-2 rounded-xl border border-emerald-900/70 bg-zinc-950 px-3 py-2.5 text-left text-xs font-bold uppercase tracking-wide text-emerald-400 hover:border-emerald-500/60 transition">' +
    '<span>Shipping — how it works</span><span id="apex-ship-arrow" class="text-emerald-500">▼</span></button>' +
    '<div id="apex-ship-panel" class="hidden mt-2 rounded-xl border border-emerald-900/50 bg-black/60 p-3 text-left backdrop-blur-sm">' +
    '<p class="text-[10px] font-bold uppercase tracking-wider text-emerald-400/90 mb-2">Ships from our Florida warehouse</p>' +
    '<ul class="space-y-1.5 text-xs text-zinc-400 leading-relaxed">' +
    '<li><span class="text-white font-semibold">Under $100</span> — most orders ship for a flat <span class="text-emerald-400 font-bold">$7.95</span>.</li>' +
    '<li><span class="text-white font-semibold">$100 or more with 3 or more items</span> — <span class="text-emerald-400 font-bold">free</span> standard shipping.</li>' +
    '<li><span class="text-white font-semibold">Only 1 or 2 items</span> — flat <span class="text-emerald-400 font-bold">$7.95</span> (even if the total is over $100).</li>' +
    '<li><span class="text-white font-semibold">Large 64 oz diets</span> — flat by themselves; free only when the cart has 3+ items and $100+.</li>' +
    '<li><span class="text-white font-semibold">Wholesale bulk</span> — freight is billed separately.</li>' +
    '</ul>' +
    '<p class="text-[11px] text-zinc-500 mt-2">You will see the exact shipping total on the payment screen.</p>' +
    '</div>';
  var buttons = modal.querySelectorAll("button");
  var lastPay = null;
  for (var i = 0; i < buttons.length; i++) {
    var t = (buttons[i].textContent || "").toLowerCase();
    var oc = buttons[i].getAttribute("onclick") || "";
    if (t.indexOf("paypal") >= 0 || t.indexOf("stripe") >= 0 || oc.indexOf("PayPal") >= 0 || oc.indexOf("Stripe") >= 0 || oc.indexOf("startPay") >= 0 || oc.indexOf("checkoutStripe") >= 0) {
      lastPay = buttons[i];
    }
  }
  if (lastPay && lastPay.parentNode) {
    if (lastPay.nextSibling) lastPay.parentNode.insertBefore(box, lastPay.nextSibling);
    else lastPay.parentNode.appendChild(box);
  } else {
    var inner = modal.querySelector(".bg-zinc-900, .rounded-2xl") || modal;
    inner.appendChild(box);
  }
  var btn = document.getElementById("apex-ship-toggle");
  var panel = document.getElementById("apex-ship-panel");
  var arrow = document.getElementById("apex-ship-arrow");
  if (btn && panel) {
    btn.onclick = function (e) {
      e.preventDefault();
      e.stopPropagation();
      var open = panel.classList.contains("hidden");
      panel.classList.toggle("hidden", !open);
      if (arrow) arrow.textContent = open ? "▲" : "▼";
    };
  }
}
window.ensureShippingExplainer = ensureShippingExplainer;

(function hookCartOpen() {
  function wrap() {
    var prev = window.openCartModal;
    if (typeof prev !== "function" || prev.__apexShipHooked) return;
    function hooked() {
      prev.apply(this, arguments);
      try { setTimeout(ensureShippingExplainer, 0); } catch (e) {}
    }
    hooked.__apexShipHooked = true;
    window.openCartModal = hooked;
  }
  wrap();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wrap);
  } else {
    setTimeout(wrap, 50);
  }
})();
