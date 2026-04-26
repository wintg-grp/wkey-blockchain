#!/usr/bin/env bash
# =============================================================================
# setup-rpc.sh — Bootstrap d'un nœud RPC public WINTG (derrière Nginx)
# =============================================================================
set -euo pipefail

NETWORK="${1:-testnet}"
case "$NETWORK" in
  mainnet) NETWORK_ID=2280; DOMAIN="chain.wkey.app"; WS_DOMAIN="ws.wkey.app" ;;
  testnet) NETWORK_ID=22800; DOMAIN="testnet-rpc.wkey.app"; WS_DOMAIN="testnet-ws.wkey.app" ;;
  *) echo "Usage: $0 [testnet|mainnet]" >&2; exit 1 ;;
esac

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ETC_DIR="/etc/besu"
BESU_USER="besu"

[ "$EUID" -eq 0 ] || { echo "Doit être lancé en root." >&2; exit 1; }

# Bootstrap commun (Besu + clé + systemd + UFW)
"$REPO_DIR/scripts/setup-validator.sh" "$NETWORK"

# Remplacer la config
cp "$REPO_DIR/besu/config-rpc.toml" "$ETC_DIR/config.toml"
chown "$BESU_USER:$BESU_USER" "$ETC_DIR/config.toml"

# Identité
sed -i 's/WINTG Validator/WINTG RPC Public/' /etc/systemd/system/besu.service
sed -i "s|Environment=\"BESU_OPTS=-Xmx8g|Environment=\"BESU_OPTS=-Xmx12g|" /etc/systemd/system/besu.service
systemctl daemon-reload

# Installer Nginx + Certbot
apt-get install -y -qq nginx python3-certbot-nginx
ufw allow 80/tcp
ufw allow 443/tcp

# Config Nginx — reverse proxy avec rate limiting
cat > /etc/nginx/sites-available/wintg-rpc <<NGINX
limit_req_zone \$binary_remote_addr zone=wintg_rpc:10m rate=30r/s;

server {
    listen 80;
    server_name ${DOMAIN};
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 301 https://\$host\$request_uri; }
}

server {
    listen 443 ssl http2;
    server_name ${DOMAIN};

    ssl_certificate     /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;
    ssl_protocols TLSv1.3 TLSv1.2;
    ssl_ciphers HIGH:!aNULL:!MD5;

    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;

    client_max_body_size 1m;
    proxy_read_timeout 60s;

    location / {
        limit_req zone=wintg_rpc burst=60 nodelay;
        proxy_pass http://127.0.0.1:8545;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}

server {
    listen 443 ssl http2;
    server_name ${WS_DOMAIN};
    ssl_certificate     /etc/letsencrypt/live/${WS_DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${WS_DOMAIN}/privkey.pem;
    ssl_protocols TLSv1.3 TLSv1.2;

    location / {
        proxy_pass http://127.0.0.1:8546;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_read_timeout 86400;
    }
}
NGINX

ln -sfn /etc/nginx/sites-available/wintg-rpc /etc/nginx/sites-enabled/wintg-rpc
rm -f /etc/nginx/sites-enabled/default
nginx -t

# Certbot (HTTP-01) — à exécuter manuellement la 1ère fois si DNS pas pointé :
# certbot --nginx -d ${DOMAIN} -d ${WS_DOMAIN} --non-interactive --agree-tos -m admin@wkey.app

systemctl restart nginx
systemctl restart besu

echo
echo "✓ Nœud RPC public configuré."
echo "  - Domaine HTTPS : https://${DOMAIN}"
echo "  - Domaine WS    : wss://${WS_DOMAIN}"
echo "  - Lancer certbot la première fois : sudo certbot --nginx -d ${DOMAIN} -d ${WS_DOMAIN}"
