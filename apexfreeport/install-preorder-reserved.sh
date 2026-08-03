#!/bin/bash
set -e
cd ~/apexfreeport

node << 'NODE'
const fs = require("fs");
let s = fs.readFileSync("checkout-routes.js", "utf8");
if (s.indexOf("preorder: !!it.preorder") < 0) {
  s = s.replace(
    "shippingTerms: it.shippingTerms || \"\"\n    };",
    "shippingTerms: it.shippingTerms || \"\",\n      preorder: !!it.preorder\n    };"
  );
}
if (s.indexOf("function reservePreorderStock") < 0) {
  const fn = `
function reservePreorderStock(items) {
  try {
    if (!fs.existsSync(INVENTORY_FILE)) return;
    var inv = JSON.parse(fs.readFileSync(INVENTORY_FILE, "utf8"));
    var stores = inv.stores || { herp: inv };
    var changed = false;
    (items || []).forEach(function (line) {
      if (!line || !line.preorder) return;
      var sku = String(line.sku || "");
      var need = Number(line.quantity) || 1;
      Object.keys(stores).forEach(function (sid) {
        var st = stores[sid];
        var list = (st && st.items) || [];
        var it = list.find(function (x) { return x && x.sku === sku; });
        if (it) {
          it.reserved = (Number(it.reserved) || 0) + need;
          changed = true;
        }
      });
    });
    if (changed) {
      inv.updated = new Date().toISOString();
      fs.writeFileSync(INVENTORY_FILE, JSON.stringify(inv));
    }
  } catch (e) {
    console.error("reservePreorderStock", e.message);
  }
}
`;
  s = s.replace("function appendOrder(order) {", fn + "\nfunction appendOrder(order) {");
}
if (s.indexOf("hasPreorder") < 0) {
  s = s.replace(
    "function appendOrder(order) {\n  const data = readOrders();\n  if (!Array.isArray(data.orders)) data.orders = [];\n  data.orders.unshift(order);\n  writeOrders(data);\n  return order;\n}",
    "function appendOrder(order) {\n  const data = readOrders();\n  if (!Array.isArray(data.orders)) data.orders = [];\n  order = order || {};\n  var lines = order.items || [];\n  order.hasPreorder = lines.some(function (it) { return it && it.preorder; });\n  if (order.hasPreorder) {\n    order.fulfillmentNote = (order.fulfillmentNote || \"\") + \" PREORDER — purchase stock after payment.\";\n    reservePreorderStock(lines);\n  }\n  data.orders.unshift(order);\n  writeOrders(data);\n  return order;\n}"
  );
} else if (s.indexOf("reservePreorderStock(lines)") < 0) {
  s = s.replace(
    "if (order.hasPreorder) order.fulfillmentNote = (order.fulfillmentNote || \"\") + \" PREORDER — purchase stock after payment.\";",
    "if (order.hasPreorder) {\n    order.fulfillmentNote = (order.fulfillmentNote || \"\") + \" PREORDER — purchase stock after payment.\";\n    reservePreorderStock(lines);\n  }"
  );
}
fs.writeFileSync("checkout-routes.js", s);
console.log("checkout reserve", s.indexOf("reservePreorderStock") >= 0);

let idx = fs.readFileSync("admin/index.html", "utf8");
if (idx.indexOf('id="p_preorder"') < 0) {
  idx = idx.replace(
    "SHOW ON SALES PAGE</strong> — retail website + sales table. Off when WHOLESALE is on.</span></label>\n      </div>",
    "SHOW ON SALES PAGE</strong> — retail website + sales table. Off when WHOLESALE is on.</span></label>\n        <label class=\"rowlab\"><input type=\"checkbox\" id=\"p_preorder\" style=\"width:auto;accent-color:#38bdf8\"> <span><strong>PREORDER</strong> — sell with qty 0.</span></label>\n      </div>"
  );
}
if (idx.indexOf("<th>Reserved</th>") < 0) {
  idx = idx.replace("<th>Qty</th><th>Sales page</th>", "<th>Qty</th><th>Reserved</th><th>Sales page</th>");
}
idx = idx.replace(/app\.js\?v=[^"']+/, "app.js?v=preorder2");
fs.writeFileSync("admin/index.html", idx);
console.log("index Reserved col", idx.indexOf("<th>Reserved</th>") >= 0);

let app = fs.readFileSync("admin/app.js", "utf8");
if (app.indexOf("p_preorder") < 0) {
  app = app.replace(
    'if ($("p_listed")) $("p_listed").checked = true;\n    if ($("p_wholesale")) $("p_wholesale").checked = false;',
    'if ($("p_listed")) $("p_listed").checked = true;\n    if ($("p_preorder")) $("p_preorder").checked = false;\n    if ($("p_wholesale")) $("p_wholesale").checked = false;'
  );
  app = app.replace(
    'if ($("p_listed")) $("p_listed").checked = isListed(it);\n    var pool = itemPool(it);',
    'if ($("p_listed")) $("p_listed").checked = isListed(it);\n    if ($("p_preorder")) $("p_preorder").checked = !!(it.preorder === true || it.preorder === "true");\n    var pool = itemPool(it);'
  );
  app = app.replace(
    'listed: $("p_listed") ? !!$("p_listed").checked : true,\n      dropShip:',
    'listed: $("p_listed") ? !!$("p_listed").checked : true,\n      preorder: $("p_preorder") ? !!$("p_preorder").checked : false,\n      dropShip:'
  );
}
if (app.indexOf("Number(it.reserved)") < 0 && app.indexOf('data-act="minus"') >= 0) {
  const lines = app.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].indexOf('data-act="minus"') >= 0 && lines[i + 1] && lines[i + 1].indexOf("saleBtn") >= 0) {
      lines.splice(i + 1, 0, "        '<td style=\"color:#38bdf8;font-weight:800\">' + (Number(it.reserved) || 0) + '</td>' +");
      break;
    }
  }
  app = lines.join("\n");
}
app = app.replace("var cols = wholesaleMode ? 10 : 7;", "var cols = wholesaleMode ? 11 : 8;");
fs.writeFileSync("admin/app.js", app);
console.log("app reserved cell", app.indexOf("Number(it.reserved)") >= 0);
NODE

node --check server.js
node --check checkout-routes.js
node --check admin/app.js

pkill -f "node server.js" 2>/dev/null || true
sleep 1
set -a; source /etc/apexfreeport.env; set +a
nohup node server.js >> /tmp/apexfreeport.log 2>&1 &
sleep 2
curl -s http://127.0.0.1:3000/health; echo
echo "DONE"
