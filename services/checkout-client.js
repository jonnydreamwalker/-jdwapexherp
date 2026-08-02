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
