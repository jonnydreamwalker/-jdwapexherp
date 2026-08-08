#!/bin/bash
set -e
cd ~/apexfreeport

echo "== Live running totals (always on) =="

cp -a server.js server.js.bak-metrics 2>/dev/null || true
cp -a admin/index.html admin/index.html.bak-metrics 2>/dev/null || true
cp -a admin/app.js admin/app.js.bak-metrics 2>/dev/null || true

node << 'NODE'
const fs = require("fs");
let s = fs.readFileSync("server.js", "utf8");

if (s.indexOf("getGlobalFinancialMetrics") < 0) {
  const block = `
function readOrdersFileMetrics() {
  try {
    if (!fs.existsSync(ORDERS)) return { orders: [] };
    return JSON.parse(fs.readFileSync(ORDERS, "utf8"));
  } catch (e) { return { orders: [] }; }
}
function getGlobalFinancialMetrics() {
  var d = readOrdersFileMetrics();
  var list = Array.isArray(d.orders) ? d.orders : [];
  var ok = list.filter(function (o) {
    var st = String((o && o.status) || "").toLowerCase();
    return st === "paid" || st === "complete" || st === "completed" || st === "shipped" || st === "processing_complete";
  });
  var totalSold = ok.length;
  var totalAmountIn = 0;
  var combinedTotalProfit = 0;
  ok.forEach(function (o) {
    var retail = o.total != null ? Number(o.total) : 0;
    if (!(retail > 0) && o.financial_ledger && o.financial_ledger.retail_received != null)
      retail = Number(o.financial_ledger.retail_received) || 0;
    if (!(retail > 0) && Array.isArray(o.items))
      retail = o.items.reduce(function (sum, it) {
        return sum + (Number(it.price) || 0) * (Number(it.quantity) || 1);
      }, 0);
    var wholesale = 0;
    if (o.financial_ledger && o.financial_ledger.wholesale_paid != null)
      wholesale = Number(o.financial_ledger.wholesale_paid) || 0;
    else if (o.wholesalePaid != null) wholesale = Number(o.wholesalePaid) || 0;
    var profit = (o.financial_ledger && o.financial_ledger.net_profit != null)
      ? Number(o.financial_ledger.net_profit) : (retail - wholesale);
    totalAmountIn += retail;
    combinedTotalProfit += profit;
  });
  return {
    totalSold: totalSold,
    totalAmountIn: Math.round(totalAmountIn * 100) / 100,
    combinedTotalProfit: Math.round(combinedTotalProfit * 100) / 100
  };
}
app.get("/api/admin/metrics", auth, function (req, res) {
  try { res.json({ ok: true, metrics: getGlobalFinancialMetrics() }); }
  catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }); }
});
`;
  if (s.indexOf('app.get("/admin"') >= 0) {
    s = s.replace('app.get("/admin"', block + '\napp.get("/admin"');
  } else {
    s += "\n" + block;
  }
  fs.writeFileSync("server.js", s);
}
console.log("metrics API", fs.readFileSync("server.js", "utf8").indexOf("getGlobalFinancialMetrics") >= 0);

let idx = fs.readFileSync("admin/index.html", "utf8");
if (idx.indexOf("apex-metrics") < 0) {
  const panel = `
  <div id="apex-metrics" style="margin:12px 0 16px;padding:14px 16px;border-radius:14px;border:1px solid #064e3b;background:linear-gradient(135deg,#022c22 0%,#09090b 60%);box-shadow:0 0 28px rgba(52,211,153,.12)">
    <div style="color:#34d399;font-weight:900;font-size:11px;letter-spacing:.12em;text-transform:uppercase;margin-bottom:10px">ApexFreePort — Live totals</div>
    <div style="display:flex;flex-wrap:wrap;gap:14px 22px">
      <div><div style="color:#71717a;font-size:10px;font-weight:700;text-transform:uppercase">Orders sold</div><div id="m_sold" style="color:#fff;font-size:22px;font-weight:900">—</div></div>
      <div><div style="color:#71717a;font-size:10px;font-weight:700;text-transform:uppercase">Money in</div><div id="m_in" style="color:#6ee7b7;font-size:22px;font-weight:900">—</div></div>
      <div><div style="color:#71717a;font-size:10px;font-weight:700;text-transform:uppercase">Net (retail − cost)</div><div id="m_profit" style="color:#fbbf24;font-size:22px;font-weight:900">—</div></div>
    </div>
    <p style="margin:8px 0 0;color:#52525b;font-size:11px">Updates from paid orders. Profit needs cost entered on an order to drop below retail.</p>
  </div>`;
  if (idx.indexOf('id="slogan"') >= 0) {
    idx = idx.replace(/<div class="slogan" id="slogan">[^<]*<\/div>/, function (m) { return m + panel; });
  } else if (idx.indexOf('<div class="wrap">') >= 0) {
    idx = idx.replace('<div class="wrap">', '<div class="wrap">' + panel);
  } else {
    idx = idx.replace("</header>", "</header>" + panel);
  }
  fs.writeFileSync("admin/index.html", idx);
}
console.log("admin panel", fs.readFileSync("admin/index.html", "utf8").indexOf("apex-metrics") >= 0);

let app = fs.readFileSync("admin/app.js", "utf8");
if (app.indexOf("loadMetrics") < 0) {
  const fn = `
  function loadMetrics() {
    api("/api/admin/metrics").then(function (j) {
      var m = (j && j.metrics) || {};
      var sold = document.getElementById("m_sold");
      var inn = document.getElementById("m_in");
      var prof = document.getElementById("m_profit");
      if (sold) sold.textContent = m.totalSold != null ? String(m.totalSold) : "0";
      if (inn) inn.textContent = "$" + (Number(m.totalAmountIn) || 0).toFixed(2);
      if (prof) prof.textContent = "$" + (Number(m.combinedTotalProfit) || 0).toFixed(2);
    }).catch(function () {});
  }
`;
  app = fn + app;
  if (app.indexOf("loadMetrics()") < 0) {
    if (app.indexOf("load();") >= 0) {
      app = app.replace(/load\(\);/, "load();\n  loadMetrics();\n  setInterval(loadMetrics, 15000);");
    } else {
      app += "\n  try { loadMetrics(); setInterval(loadMetrics, 15000); } catch (e) {}\n";
    }
  }
  fs.writeFileSync("admin/app.js", app);
} else if (app.indexOf("setInterval(loadMetrics") < 0) {
  app = app.replace(/loadMetrics\(\);/, "loadMetrics();\n  setInterval(loadMetrics, 15000);");
  fs.writeFileSync("admin/app.js", app);
}
console.log("admin loadMetrics", fs.readFileSync("admin/app.js", "utf8").indexOf("loadMetrics") >= 0);
NODE

node --check server.js
node --check admin/app.js

pkill -f "node server.js" 2>/dev/null || true
sleep 1
set -a; source /etc/apexfreeport.env; set +a
nohup node server.js >> /tmp/apexfreeport.log 2>&1 &
sleep 2
curl -s http://127.0.0.1:3000/health; echo
echo DONE live-metrics
