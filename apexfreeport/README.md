# Apex FreePort

Inventory bridge for **jdwapexherp.com** (JDW Apex · veteran-owned · DeFuniak Springs, FL).

FreePort holds warehouse inventory (qty, price, lane, status). The herp site reads `/api/products` when **Public feed** is ON.

---

## Why inventory disappeared over the weekend

The herp catalog goes blank when **any** of these happen:

1. **Node process died** — started with `nohup` only; reboot, crash, or OOM kills it and nothing auto-restarts.
2. **Public feed OFF** — red **DON'T TOUCH** switch in admin turns the public API off (`503` + “Inventory bridge offline”).
3. **EC2 stopped / unreachable** — site cannot reach `http://YOUR_IP:3000`.

**Fix:** run FreePort as a **systemd service** (starts on boot, restarts on crash). Keep the feed ON only when you want the site live.

---

## Keep it online (systemd — do this once)

On EC2 as `ec2-user`:

```bash
cd ~/apexfreeport

# 1. Env file (edit password/tokens; never commit this file)
sudo tee /etc/apexfreeport.env >/dev/null << 'EOF'
ADMIN_PASSWORD=Funky@$$777
ADMIN_USER=admin
SESSION_SECRET=apex-change-this-to-a-long-random-string
SQUARE_ACCESS_TOKEN=
STRIPE_SECRET_KEY=
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
PORT=3000
EOF
sudo chmod 600 /etc/apexfreeport.env

# 2. Install unit from repo
curl -sfL https://raw.githubusercontent.com/jonnydreamwalker/-jdwapexherp/main/apexfreeport/apexfreeport.service \
  | sudo tee /etc/systemd/system/apexfreeport.service >/dev/null

# 3. Enable + start (survives reboot)
sudo systemctl daemon-reload
sudo systemctl enable apexfreeport
sudo systemctl restart apexfreeport
sudo systemctl status apexfreeport --no-pager

# 4. Health check
curl -s http://127.0.0.1:3000/health
```

Useful commands:

```bash
sudo systemctl status apexfreeport
sudo systemctl restart apexfreeport
journalctl -u apexfreeport -f
```

Stop using bare `nohup node server.js` once systemd is enabled.

---

## Admin

- URL: `http://YOUR_PUBLIC_IP:3000/admin` (or login page first)
- Stores: Apex Herp · Apex K9 · Apex Feline
- **DON'T TOUCH · Public feed** — ON = herp site can list stock; OFF = site shows offline (intentional)
- Inventory file on the server: `~/apexfreeport/data/inventory.json` (source of truth; do not overwrite blindly from Git)

---

## Public API (herp site)

| Endpoint | Notes |
|----------|--------|
| `GET /api/products?store=herp` | Live catalog when feed ON |
| `GET /health` | Process up + feed flags |

When feed is OFF, `/api/products` returns **503** with `feed_off` — that is by design.

---

## Manual start (dev only)

```bash
cd ~/apexfreeport
npm install
export ADMIN_PASSWORD='your-password'
node server.js
```

---

## Icons / tab logo

Admin HTML embeds a FreePort SVG favicon (data URI) so the tab does not show the IP “3”.  
Optional files: `data/uploads/favicon.png` from `logos/favicon.b64` via `bash install-logos.sh`.

---

## Security notes

- Change `ADMIN_PASSWORD` and `SESSION_SECRET` in `/etc/apexfreeport.env`
- Prefer locking SSH to your IP; HTTP/HTTPS/3000 as needed for webhooks
- Do not commit real API secrets into GitHub
