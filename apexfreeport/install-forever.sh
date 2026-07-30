#!/bin/bash
# ApexFreePort — run forever (systemd). Safe to re-run.
set -e
APP_DIR="${APP_DIR:-$HOME/apexfreeport}"
ENV_FILE="/etc/apexfreeport.env"
SERVICE="/etc/systemd/system/apexfreeport.service"

cd "$APP_DIR" || { echo "Missing $APP_DIR"; exit 1; }

sudo fuser -k 3000/tcp 2>/dev/null || true
pkill -f "node server.js" 2>/dev/null || true
sleep 1

if [ ! -f "$ENV_FILE" ]; then
  sudo tee "$ENV_FILE" >/dev/null << 'EOF'
ADMIN_USER=Apex
ADMIN_PASSWORD=change-me-now
PORT=3000
SESSION_SECRET=change-this-session-secret
SQUARE_ACCESS_TOKEN=
WHOLESALE_NOTIFY_EMAIL=jonnydreamwalker@gmail.com
OWNER_EMAIL=jonnydreamwalker@gmail.com
WHOLESALE_PORTAL_URL=https://jdwapexherp.com/wholesale
EOF
  sudo chmod 600 "$ENV_FILE"
  echo "Created $ENV_FILE — set ADMIN_PASSWORD to your real password."
else
  echo "Keeping existing $ENV_FILE"
fi

if [ -f package.json ]; then npm install --omit=dev; fi

sudo tee "$SERVICE" >/dev/null << EOF
[Unit]
Description=ApexFreePort inventory bridge
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$(whoami)
WorkingDirectory=$APP_DIR
EnvironmentFile=$ENV_FILE
ExecStart=$(command -v node) server.js
Restart=always
RestartSec=3
KillMode=process
TimeoutStopSec=10
StandardOutput=append:$APP_DIR/server.log
StandardError=append:$APP_DIR/server.log

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable apexfreeport
sudo systemctl restart apexfreeport
sleep 2
sudo systemctl status apexfreeport --no-pager || true
curl -s "http://127.0.0.1:3000/health" || true
echo ""
echo "Running forever."
