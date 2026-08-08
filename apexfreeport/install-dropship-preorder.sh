#!/bin/bash
set -e
cd ~/apexfreeport

echo "== Dropship ignores local qty + Out of Stock → Preorder =="

cp -a server.js server.js.bak-dropship 2>/dev/null || true
cp -a admin/app.js admin/app.js.bak-dropship 2>/dev/null || true
cp -a admin/index.html admin/index.html.bak-dropship 2>/dev/null || true

node << 'NODE'
const fs = require("fs");
let s = fs.readFileSync("server.js", "utf8");

const re = /function publicItem\(i\) \{[\s\S]*?\n\}/;
const replacement = `function publicItem(i) {
  const qty = Number(i.qty) || 0;
  const reserved = Number(i.reserved) || 0;
  const preorder = !!(i.preorder === true || i.preorder === 1 || i.preorder === "true");
  const dropShip = !!(i.dropShip === true || i.dropShip === 1 || i.dropShip === "true" || i.lane === "external");
  let available = Math.max(0, qty - reserved);
  // Dropship: do not gate sales on local warehouse count
  if (dropShip && !preorder) available = Math.max(available, 99);
  if (preorder) available = Math.max(available, 1);
  return {
    sku: i.sku,
    name: i.name,
    category: i.category || "",
    description: i.description || "",
    price: Number(i.price) || 0,
    qty: qty,
    reserved: reserved,
    available: available,
    preorder: preorder,
    dropShip: dropShip,
    status: i.status || "active",
    image: (i.images && i.images[0]) || i.image || "",
    images: i.images || (i.image ? [i.image] : []),
    videos: i.videos || []
  };
}`;

if (!re.test(s)) {
  console.error("publicItem not found");
  process.exit(1);
}
s = s.replace(re, replacement);

if (s.indexOf("dropShip: dropShip") >= 0 && s.indexOf("preorder: !!(b.preorder") < 0) {
  s = s.replace(
    "dropShip: dropShip, supplier: b.supplier || \"\",",
    "dropShip: dropShip, preorder: !!(b.preorder === true || b.preorder === 1 || b.preorder === \"true\"), supplier: b.supplier || \"\","
  );
}
if (s.indexOf("if (b.dropShip != null)") >= 0 && s.indexOf("if (b.preorder != null)") < 0) {
  s = s.replace(
    "if (b.dropShip != null) item.dropShip = dropShip;",
    "if (b.dropShip != null) item.dropShip = dropShip;\n    if (b.preorder != null) item.preorder = !!(b.preorder === true || b.preorder === 1 || b.preorder === \"true\");"
  );
}

fs.writeFileSync("server.js", s);
console.log("server publicItem ok", /dropShip && !preorder/.test(s));

let app = fs.readFileSync("admin/app.js", "utf8");
if (app.indexOf("markDealerOutPreorder") < 0) {
  app += `\n\nwindow.markDealerOutPreorder = function () {
  if (!$("p_sku") || !$("p_sku").value) {
    alert("Open a product first.");
    return;
  }
  if ($("p_preorder")) $("p_preorder").checked = true;
  if ($("p_qty")) $("p_qty").value = "0";
  alert("Switched to Preorder (dealer out). Click Save to apply — site shows Preorder button.");
};
`;
}

if (app.indexOf('preorder:') < 0 && app.indexOf("dropShip:") >= 0) {
  app = app.replace(
    /dropShip:\s*\$\("p_dropShip"\)\s*\?\s*!!\$\("p_dropShip"\)\.checked\s*:\s*false,?/,
    'dropShip: $("p_dropShip") ? !!$("p_dropShip").checked : false,\n      preorder: $("p_preorder") ? !!$("p_preorder").checked : false,'
  );
}
if (app.indexOf('p_preorder")') >= 0 || true) {
  if (app.indexOf('p_preorder").checked') < 0 && app.indexOf('p_dropShip").checked') >= 0) {
    app = app.replace(
      'if ($("p_dropShip")) $("p_dropShip").checked = !!(it.dropShip',
      'if ($("p_preorder")) $("p_preorder").checked = !!(it.preorder === true || it.preorder === 1 || it.preorder === "true");\n    if ($("p_dropShip")) $("p_dropShip").checked = !!(it.dropShip'
    );
  }
}
fs.writeFileSync("admin/app.js", app);
console.log("admin app ok");

let idx = fs.readFileSync("admin/index.html", "utf8");
if (idx.indexOf("p_preorder") < 0) {
  if (idx.indexOf("p_reserved") >= 0) {
    idx = idx.replace(
      /(<input[^>]*id="p_reserved"[^>]*>)/,
      '$1\n        <label class="rowlab" style="margin-top:8px"><input type="checkbox" id="p_preorder" style="width:auto;accent-color:#38bdf8"> <span><strong>PREORDER</strong> — sell now, ship when stock arrives.</span></label>'
    );
  }
}
if (idx.indexOf("btnDealerOut") < 0 && idx.indexOf("p_dropShip") >= 0) {
  idx = idx.replace(
    /(<label class="rowlab"><input type="checkbox" id="p_dropShip"[\s\S]*?<\/label>)/,
    '$1\n        <p class="hint" style="margin:8px 0 0;font-size:12px;color:#a1a1aa">Drop ship ignores your local qty on the sales site. When the dealer is out, hit the button below.</p>\n        <button type="button" id="btnDealerOut" class="secondary" style="margin-top:8px" onclick="markDealerOutPreorder()">Out of Stock → Preorder</button>'
  );
}
fs.writeFileSync("admin/index.html", idx);
console.log("admin index preorder", idx.indexOf("p_preorder") >= 0, "btn", idx.indexOf("btnDealerOut") >= 0);
NODE

node --check server.js
node --check admin/app.js

pkill -f "node server.js" 2>/dev/null || true
sleep 1
set -a; source /etc/apexfreeport.env; set +a
nohup node server.js >> /tmp/apexfreeport.log 2>&1 &
sleep 2
curl -s http://127.0.0.1:3000/health; echo
echo DONE dropship-preorder
