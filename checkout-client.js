/** Apex cart checkout — Stripe + PayPal via FreePort */
window.APEX_API_BASE = window.APEX_API_BASE || "https://freeport.jdwapexherp.com";

function apexCartPayload() {
  var cart = JSON.parse(localStorage.getItem("jdw_cart") || "[]") || [];
  return cart.map(function (i) {
    return {
      name: i.name,
      sku: i.sku,
      price: Number(i.price) || 0,
      quantity: Number(i.quantity) || 1
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

/** After Stripe/PayPal success redirect (?paid=1) empty cart once and clean the URL */
function handlePaidReturn() {
  try {
    var q = new URLSearchParams(window.location.search || "");
    var paid = q.get("paid");
    if (!paid) return;
    clearApexCart();
    if (window.history && window.history.replaceState) {
      var clean = window.location.pathname + (window.location.hash || "");
      window.history.replaceState({}, document.title, clean);
    }
    if (!window.__apexPaidToast) {
      window.__apexPaidToast = true;
      setTimeout(function () {
        try {
          alert("Payment received — thank you. Your cart has been cleared.");
        } catch (e) {}
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
