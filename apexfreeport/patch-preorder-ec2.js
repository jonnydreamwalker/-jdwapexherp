const fs = require("fs");

let srv = fs.readFileSync("server.js", "utf8");
if (!srv.includes("item.preorder") && !srv.includes("preorder: (i.preorder")) {
  srv = srv.replace(
    "status: i.status || \"active\",\n    image: (i.images && i.images[0]) || i.image || \"\",",
    "status: i.status || \"active\",\n    preorder: (i.preorder === true || i.preorder === \"true\" || i.preorder === 1),\n    image: (i.images && i.images[0]) || i.image || \"\","
  );
}
if (!srv.includes("item.preorder =")) {
  srv = srv.replace(
    "if (b.listed != null) item.listed = !(b.listed === false || b.listed === \"false\" || b.listed === 0);",
    "if (b.listed != null) item.listed = !(b.listed === false || b.listed === \"false\" || b.listed === 0);\n  if (b.preorder != null) item.preorder = (b.preorder === true || b.preorder === \"true\" || b.preorder === 1);"
  );
}
if (!srv.includes("preorder: b.preorder") && srv.includes('listed: true,\n      image: "", images: [], videos: []')) {
  srv = srv.replace(
    'listed: true,\n      image: "", images: [], videos: []',
    'listed: true,\n      preorder: b.preorder === true || b.preorder === "true" || b.preorder === 1,\n      image: "", images: [], videos: []'
  );
}
fs.writeFileSync("server.js", srv);
console.log("server.js", srv.includes("item.preorder") || srv.includes("preorder: (i.preorder"));

let idx = fs.readFileSync("admin/index.html", "utf8");
if (!idx.includes('id="p_preorder"')) {
  idx = idx.replace(
    "SHOW ON SALES PAGE</strong> — retail website + sales table. Off when WHOLESALE is on.</span></label>\n      </div>",
    'SHOW ON SALES PAGE</strong> — retail website + sales table. Off when WHOLESALE is on.</span></label>\n        <label class="rowlab"><input type="checkbox" id="p_preorder" style="width:auto;accent-color:#38bdf8"> <span><strong>PREORDER</strong> — sell before stock lands. Qty can be 0; site shows Preorder button.</span></label>\n      </div>'
  );
  idx = idx.replace(/app\.js\?v=[^"]+/, "app.js?v=pre1");
}
fs.writeFileSync("admin/index.html", idx);
console.log("index", idx.includes("p_preorder"));

let app = fs.readFileSync("admin/app.js", "utf8");
if (!app.includes("p_preorder")) {
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
  app = app.replace(
    "location: it.location, description: it.description, listed: listed,\n        dealerPrice:",
    "location: it.location, description: it.description, listed: listed, preorder: !!it.preorder,\n        dealerPrice:"
  );
  if (!app.includes("PREORDER</span>")) {
    app = app.replace(
      'var hid = listed ? "" : \'<span class="hid-badge">HIDDEN</span>\';',
      'var hid = listed ? "" : \'<span class="hid-badge">HIDDEN</span>\';\n      var pre = (it.preorder === true || it.preorder === "true") ? \'<span class="ds-badge" style="background:#0c4a6e;color:#7dd3fc">PREORDER</span>\' : "";'
    );
    app = app.replace(
      '"</strong>" + ds + wh + hid + "</div></td>" +',
      '"</strong>" + ds + wh + hid + pre + "</div></td>" +'
    );
  }
}
fs.writeFileSync("admin/app.js", app);
console.log("app", app.includes("p_preorder"));
