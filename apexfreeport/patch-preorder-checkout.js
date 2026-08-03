const fs = require("fs");
let s = fs.readFileSync("checkout-routes.js", "utf8");
if (s.indexOf("preorder: !!it.preorder") < 0) {
  s = s.replace(
    "shippingTerms: it.shippingTerms || \"\"\n    };",
    "shippingTerms: it.shippingTerms || \"\",\n      preorder: !!it.preorder\n    };"
  );
}
if (s.indexOf("hasPreorder") < 0) {
  s = s.replace(
    "function appendOrder(order) {\n  const data = readOrders();\n  if (!Array.isArray(data.orders)) data.orders = [];\n  data.orders.unshift(order);\n  writeOrders(data);\n  return order;\n}",
    "function appendOrder(order) {\n  const data = readOrders();\n  if (!Array.isArray(data.orders)) data.orders = [];\n  order = order || {};\n  var lines = order.items || [];\n  order.hasPreorder = lines.some(function (it) { return it && it.preorder; });\n  if (order.hasPreorder) order.fulfillmentNote = (order.fulfillmentNote || \"\") + \" PREORDER — purchase stock after payment.\";\n  data.orders.unshift(order);\n  writeOrders(data);\n  return order;\n}"
  );
}
fs.writeFileSync("checkout-routes.js", s);
console.log("checkout preorder", s.indexOf("hasPreorder") >= 0, s.indexOf("preorder: !!it.preorder") >= 0);
