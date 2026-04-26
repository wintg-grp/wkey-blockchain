#!/usr/bin/env bash
# =============================================================================
# setup-validator.sh — Bootstrap d'un validateur WINTG (Ubuntu 22.04 LTS)
# =============================================================================
# Pour AlmaLinux 9 / Rocky 9 / RHEL 9 : utiliser `install-besu-almalinux.sh`
# (notamment si DirectAdmin est installé sur le serveur).
#
# Détection automatique : si l'OS est AlmaLinux/RHEL, ce script délègue.
#
# Usage : sudo ./scripts/setup-validator.sh [testnet|mainnet]
#
# Prérequis serveur : 8 vCPU, 16 GB RAM, 200 GB SSD NVMe, Ubuntu 22.04+.
# =============================================================================
set -euo pipefail

NETWORK="${1:-testnet}"
case "$NETWORK" in
  mainnet) NETWORK_ID=2280 ;;
  testnet) NETWORK_ID=22800 ;;
  *) echo "Usage: $0 [testnet|mainnet]" >&2; exit 1 ;;
esac

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BESU_VERSION="${BESU_VERSION:-26.4.0}"
BESU_HOME="/opt/besu/${BESU_VERSION}"
ETC_DIR="/etc/besu"
DATA_DIR="/var/lib/besu/data"
LOG_DIR="/var/log/besu"
BESU_USER="besu"

step() { printf "\n\033[1;36m▶ %s\033[0m\n" "$*"; }
ok()   { printf "  \033[1;32m✓\033[0m %s\n" "$*"; }

[ "$EUID" -eq 0 ] || { echo "Doit être lancé en root (sudo)." >&2; exit 1; }

# Auto-redirect vers install-besu-almalinux.sh si AlmaLinux/RHEL/Rocky
if [ -f /etc/os-release ]; then
  . /etc/os-release
  if echo "${ID:-} ${ID_LIKE:-}" | grep -qiE "(almalinux|rhel|rocky|centos|fedora)"; then
    echo "▶ OS détecté : $NAME — redirection vers install-besu-almalinux.sh"
    exec "$(dirname "${BASH_SOURCE[0]}")/install-besu-almalinux.sh" "$NETWORK" validator
  fi
fi

# -----------------------------------------------------------------------------
step "1/8 — Mise à jour OS et dépendances"
apt-get update -qq
apt-get install -y -qq curl wget gnupg jq ufw fail2ban openjdk-21-jre-headless
ok "Paquets installés"

# -----------------------------------------------------------------------------
step "2/8 — Création utilisateur besu"
if ! id "$BESU_USER" &>/dev/null; then
  useradd -r -s /usr/sbin/nologin -m -d "/var/lib/besu" "$BESU_USER"
  ok "Utilisateur '$BESU_USER' créé"
else
  ok "Utilisateur '$BESU_USER' existe déjà"
fi

# -----------------------------------------------------------------------------
step "3/8 — Téléchargement Besu ${BESU_VERSION}"
if [ ! -d "$BESU_HOME" ]; then
  mkdir -p /opt/besu
  TMP_TARBALL="/tmp/besu-${BESU_VERSION}.tar.gz"
  wget -q --show-progress \
    "https://github.com/besu-eth/besu/releases/download/${BESU_VERSION}/besu-${BESU_VERSION}.tar.gz" \
    -O "$TMP_TARBALL"
  wget -q \
    "https://github.com/besu-eth/besu/releases/download/${BESU_VERSION}/besu-${BESU_VERSION}.tar.gz.sha256" \
    -O "${TMP_TARBALL}.sha256"
  EXPECTED=$(awk '{print $1}' "${TMP_TARBALL}.sha256")
  ACTUAL=$(sha256sum "$TMP_TARBALL" | awk '{print $1}')
  [ "$EXPECTED" = "$ACTUAL" ] || { echo "SHA256 mismatch !" >&2; exit 1; }
  tar -xzf "$TMP_TARBALL" -C /opt/besu
  rm -f "$TMP_TARBALL" "${TMP_TARBALL}.sha256"
  ok "Besu installé dans $BESU_HOME"
else
  ok "Besu ${BESU_VERSION} déjà présent"
fi

ln -sfn "$BESU_HOME" /opt/besu/current
ln -sfn /opt/besu/current/bin/besu /usr/local/bin/besu
ok "Symlinks /opt/besu/current et /usr/local/bin/besu"

# -----------------------------------------------------------------------------
step "4/8 — Configuration des dossiers"
mkdir -p "$ETC_DIR/keys" "$DATA_DIR" "$LOG_DIR"
cp "$REPO_DIR/besu/genesis.json" "$ETC_DIR/genesis.json"
cp "$REPO_DIR/besu/config.toml" "$ETC_DIR/config.toml"
cp "$REPO_DIR/besu/permissions_config.toml" "$ETC_DIR/permissions_config.toml"
cp "$REPO_DIR/besu/static-nodes.json" "$ETC_DIR/static-nodes.json"
chown -R "$BESU_USER:$BESU_USER" "$ETC_DIR" "$DATA_DIR" "$LOG_DIR"
chmod 700 "$ETC_DIR/keys"
ok "Configs copiées dans $ETC_DIR"

# -----------------------------------------------------------------------------
step "5/8 — Génération de la clé validateur"
KEY_FILE="$ETC_DIR/keys/key"
if [ ! -f "$KEY_FILE" ]; then
  sudo -u "$BESU_USER" besu --data-path="$DATA_DIR" public-key export \
    --to="$ETC_DIR/keys/key.pub"
  cp "$DATA_DIR/key" "$KEY_FILE"
  chmod 600 "$KEY_FILE"
  chown "$BESU_USER:$BESU_USER" "$KEY_FILE"
  VALIDATOR_ADDR=$(sudo -u "$BESU_USER" besu --data-path="$DATA_DIR" public-key export-address 2>/dev/null | tail -1)
  echo "$VALIDATOR_ADDR" > "$ETC_DIR/keys/address"
  ok "Clé validateur générée. Adresse : $VALIDATOR_ADDR"
  echo
  echo "  ⚠️  Cette adresse doit être incluse dans extraData du genesis."
  echo "  ⚠️  Régénère le genesis si ce n'est pas déjà fait : npm run generate-genesis"
else
  ok "Clé existante (non écrasée)"
fi

# -----------------------------------------------------------------------------
step "6/8 — Service systemd"
cat > /etc/systemd/system/besu.service <<EOF
[Unit]
Description=Hyperledger Besu — WINTG Validator (${NETWORK})
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${BESU_USER}
Group=${BESU_USER}
Environment="BESU_OPTS=-Xmx8g -XX:+UseG1GC -XX:MaxGCPauseMillis=200"
ExecStart=/usr/local/bin/besu --config-file=${ETC_DIR}/config.toml --network-id=${NETWORK_ID}
Restart=on-failure
RestartSec=10
LimitNOFILE=65536
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${DATA_DIR} ${LOG_DIR}

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable besu
ok "Service systemd 'besu' activé"

# -----------------------------------------------------------------------------
step "7/8 — Firewall UFW + fail2ban"
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment "SSH"
ufw allow 30303/tcp comment "Besu P2P"
ufw allow 30303/udp comment "Besu P2P discovery"
# RPC, métriques : loopback uniquement (pas d'ouverture firewall)
ufw --force enable
systemctl enable --now fail2ban
ok "UFW + fail2ban actifs"

# -----------------------------------------------------------------------------
step "8/8 — Démarrage Besu"
systemctl start besu
sleep 5
if systemctl is-active --quiet besu; then
  ok "Besu démarré"
  echo
  echo "Prochaines étapes :"
  echo "  - tail -f journalctl -u besu pour suivre les logs"
  echo "  - Vérifier la prod de blocs : ./scripts/health-check.sh"
  echo "  - Configurer monitoring : voir monitoring/docker-compose.yml"
else
  echo "  ✖ Besu n'a pas démarré. Vérifier les logs : journalctl -u besu -n 50" >&2
  exit 1
fi
