#!/usr/bin/env bash
# =============================================================================
# install-besu-almalinux.sh
# Setup Hyperledger Besu sur AlmaLinux 9 / RHEL / Rocky Linux
# Compatible avec un serveur Hostinger DirectAdmin (cohabite sans conflit)
# =============================================================================
# Pré-requis :
#   - VPS AlmaLinux 9 / Rocky 9 / RHEL 9 avec accès root SSH
#   - Au moins 4 vCPU, 8 GB RAM, 100 GB SSD libres
#   - DirectAdmin (optionnel) installé sur les ports standards (80/443/2222)
#
# Usage :
#   sudo bash install-besu-almalinux.sh [testnet|mainnet] [validator|standby|rpc]
#
# Ce que fait le script :
#   1. Met à jour le système et installe Java 21 + dépendances
#   2. Télécharge Hyperledger Besu 26.4.0 (avec vérif SHA-256)
#   3. Crée l'utilisateur `besu` avec accès limité
#   4. Configure firewalld pour ouvrir les ports nécessaires
#   5. Génère ou réutilise la clé validateur
#   6. Crée le service systemd `besu`
#   7. Démarre Besu et vérifie la production de blocs
#
# Ce que le script NE fait PAS :
#   - Toucher à DirectAdmin ou ses services (Apache/Nginx, MySQL, Mail)
#   - Installer Nginx (DirectAdmin a déjà le sien)
#   - Configurer SSL/TLS (à faire via le panneau DirectAdmin pour les
#     sous-domaines, voir docs/HOSTINGER_DIRECTADMIN.md)
# =============================================================================

set -euo pipefail

NETWORK="${1:-testnet}"
ROLE="${2:-validator}"

case "$NETWORK" in
  mainnet) NETWORK_ID=2280 ;;
  testnet) NETWORK_ID=22800 ;;
  *) echo "Usage: $0 [mainnet|testnet] [validator|standby|rpc]" >&2; exit 1 ;;
esac

case "$ROLE" in
  validator|standby|rpc) ;;
  *) echo "Role must be validator, standby or rpc" >&2; exit 1 ;;
esac

[ "$EUID" -eq 0 ] || { echo "Doit être lancé en root (sudo bash $0 ...)" >&2; exit 1; }

# =============================================================================
# Helpers
# =============================================================================
cyan()  { printf "\033[1;36m═════ %s ═════\033[0m\n" "$*"; }
green() { printf "\033[1;32m✓\033[0m %s\n" "$*"; }
yellow(){ printf "\033[1;33m⚠\033[0m %s\n" "$*"; }
red()   { printf "\033[1;31m✖\033[0m %s\n" "$*" >&2; }
info()  { printf "  %s\n" "$*"; }

cyan "WINTG / WKey — Setup AlmaLinux 9 + DirectAdmin"
info "Network : $NETWORK ($NETWORK_ID)"
info "Role    : $ROLE"
info ""

# =============================================================================
# Étape 1 — Vérifier l'OS
# =============================================================================
cyan "1/9  Vérification OS"
if ! grep -qE "AlmaLinux|Rocky|Red Hat" /etc/os-release; then
  red "OS non supporté. Ce script est pour AlmaLinux 9 / Rocky 9 / RHEL 9."
  red "Pour Ubuntu : utilise scripts/wkey-deploy.sh à la place."
  exit 1
fi
. /etc/os-release
green "OS : $NAME $VERSION_ID"

# =============================================================================
# Étape 2 — Mises à jour + dépendances
# =============================================================================
cyan "2/9  Mises à jour système + dépendances"
dnf update -y -q
dnf install -y -q \
  curl wget tar gzip git jq unzip \
  java-21-openjdk-headless \
  firewalld \
  fail2ban \
  policycoreutils-python-utils
green "Paquets installés (Java 21, firewalld, fail2ban, ...)"

# Confirmer Java 21
java -version 2>&1 | head -1 || { red "Java pas trouvé"; exit 1; }

# =============================================================================
# Étape 3 — Création de l'utilisateur besu
# =============================================================================
cyan "3/9  Utilisateur 'besu'"
if id besu &>/dev/null; then
  green "Utilisateur 'besu' existe déjà"
else
  useradd -r -m -d /var/lib/besu -s /usr/sbin/nologin besu
  green "Utilisateur 'besu' créé"
fi

# Dossiers
mkdir -p /etc/besu/keys /var/lib/besu/data /var/log/besu
chown -R besu:besu /etc/besu /var/lib/besu /var/log/besu
chmod 700 /etc/besu/keys

# =============================================================================
# Étape 4 — Téléchargement Besu 26.4.0
# =============================================================================
cyan "4/9  Téléchargement Hyperledger Besu 26.4.0"
BESU_VERSION="26.4.0"
BESU_DIR="/opt/besu-${BESU_VERSION}"

if [ -d "$BESU_DIR" ]; then
  green "Besu ${BESU_VERSION} déjà téléchargé"
else
  cd /tmp
  wget -q --show-progress \
    "https://github.com/besu-eth/besu/releases/download/${BESU_VERSION}/besu-${BESU_VERSION}.tar.gz" \
    -O besu.tar.gz
  wget -q "https://github.com/besu-eth/besu/releases/download/${BESU_VERSION}/besu-${BESU_VERSION}.tar.gz.sha256" \
    -O besu.tar.gz.sha256

  EXPECTED=$(awk '{print $1}' besu.tar.gz.sha256)
  ACTUAL=$(sha256sum besu.tar.gz | awk '{print $1}')
  [ "$EXPECTED" = "$ACTUAL" ] || { red "SHA-256 mismatch !"; exit 1; }
  green "SHA-256 vérifié : $ACTUAL"

  tar -xzf besu.tar.gz -C /opt/
  rm -f besu.tar.gz besu.tar.gz.sha256
  green "Extrait dans $BESU_DIR"
fi

# Symlink stable
ln -sfn "$BESU_DIR" /opt/besu/current 2>/dev/null || ln -sfn "$BESU_DIR" /opt/besu-current
ln -sfn "${BESU_DIR}/bin/besu" /usr/local/bin/besu
green "Commande 'besu' disponible : $(besu --version 2>&1 | head -1)"

# =============================================================================
# Étape 5 — Copier les configs depuis le repo
# =============================================================================
cyan "5/9  Configuration Besu"
REPO_DIR="${REPO_DIR:-/opt/wintg}"
if [ ! -d "$REPO_DIR" ]; then
  red "Repo WINTG attendu dans $REPO_DIR — clone d'abord :"
  red "  git clone https://github.com/wkey-app/wkey-blockchain.git $REPO_DIR"
  exit 1
fi

# Choisir la bonne config selon le rôle
case "$ROLE" in
  validator) CFG_SRC="$REPO_DIR/besu/config.toml" ;;
  standby)   CFG_SRC="$REPO_DIR/besu/config-standby.toml" ;;
  rpc)       CFG_SRC="$REPO_DIR/besu/config-rpc.toml" ;;
esac

# Choisir le bon genesis
if [ "$NETWORK" = "testnet" ] && [ -f "$REPO_DIR/besu/genesis.local.json" ]; then
  cp "$REPO_DIR/besu/genesis.local.json" /etc/besu/genesis.json
  yellow "Utilisation du genesis local (validateur Hardhat dev key) — OK pour tester."
  yellow "Pour un VRAI testnet public, régénère avec : npm run generate-genesis -- --network testnet"
else
  cp "$REPO_DIR/besu/genesis.json" /etc/besu/genesis.json
fi

cp "$CFG_SRC" /etc/besu/config.toml
cp "$REPO_DIR/besu/permissions_config.toml" /etc/besu/permissions_config.toml
cp "$REPO_DIR/besu/static-nodes.json" /etc/besu/static-nodes.json
chown -R besu:besu /etc/besu
green "Configs copiées dans /etc/besu/"

# =============================================================================
# Étape 6 — Génération de la clé validateur (si pas déjà présente)
# =============================================================================
cyan "6/9  Clé validateur"
KEY_FILE="/etc/besu/keys/key"
if [ -f "$KEY_FILE" ]; then
  green "Clé déjà présente — non écrasée"
else
  if [ "$NETWORK" = "testnet" ] && [ -f "$REPO_DIR/besu/keys/key.local" ]; then
    cp "$REPO_DIR/besu/keys/key.local" "$KEY_FILE"
    chown besu:besu "$KEY_FILE"
    chmod 600 "$KEY_FILE"
    yellow "Clé locale dev copiée (Hardhat account 0). PAS POUR MAINNET."
  else
    yellow "Pas de clé pré-existante."
    yellow "Étapes pour créer une clé fraîche :"
    info "  cd /tmp && sudo -u besu besu --data-path=/tmp/keygen public-key export-address"
    info "  Récupère l'adresse, importe la clé dans /etc/besu/keys/key"
    info "  Régénère le genesis avec cette adresse comme validateur."
    info ""
    info "Pour MAINNET : générer la clé sur ton PC offline (scripts/generate-wallets.ts)"
    info "puis l'uploader chiffrée."
  fi
fi

# =============================================================================
# Étape 7 — Firewall (firewalld) + cohabitation DirectAdmin
# =============================================================================
cyan "7/9  Configuration firewalld"
systemctl enable --now firewalld

# Garder ouverts les ports DirectAdmin (s'il existe)
firewall-cmd --permanent --add-service=ssh        2>/dev/null || true
firewall-cmd --permanent --add-service=http       2>/dev/null || true
firewall-cmd --permanent --add-service=https      2>/dev/null || true
firewall-cmd --permanent --add-port=2222/tcp      2>/dev/null || true   # DirectAdmin panel

# Ajouter les ports Besu
firewall-cmd --permanent --add-port=30303/tcp     # P2P TCP
firewall-cmd --permanent --add-port=30303/udp     # P2P discovery UDP

# RPC et métriques restent en loopback (PAS exposés au firewall — sécurité)
# Ils sont accessibles uniquement via Nginx (DirectAdmin) côté HTTPS

firewall-cmd --reload
green "firewalld configuré (ports 30303 ouverts, RPC en loopback)"

# =============================================================================
# Étape 8 — Service systemd
# =============================================================================
cyan "8/9  Service systemd 'besu'"
cat > /etc/systemd/system/besu.service <<EOF
[Unit]
Description=Hyperledger Besu — WINTG ${ROLE^} (${NETWORK})
Documentation=https://besu.hyperledger.org/
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=besu
Group=besu
Environment="BESU_OPTS=-Xmx6g -XX:+UseG1GC -XX:MaxGCPauseMillis=200"
Environment="JAVA_OPTS=-Xmx6g"
ExecStart=/usr/local/bin/besu --config-file=/etc/besu/config.toml --network-id=${NETWORK_ID}
Restart=on-failure
RestartSec=10
LimitNOFILE=65536
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/besu /var/log/besu

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable besu
green "Service systemd activé"

# =============================================================================
# Étape 9 — Démarrer + vérifier
# =============================================================================
cyan "9/9  Démarrage de Besu"
systemctl restart besu
sleep 8

if systemctl is-active --quiet besu; then
  green "Besu démarré"
else
  red "Besu n'a pas démarré — vérifier : journalctl -u besu -n 50"
  exit 1
fi

# Test RPC après quelques secondes
sleep 5
B=$(curl -s --max-time 3 -X POST -H "Content-Type: application/json" \
    --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
    http://127.0.0.1:8545 | jq -r '.result // empty' 2>/dev/null)
if [ -n "$B" ]; then
  green "RPC répond — bloc courant : $B"
else
  yellow "RPC pas encore prêt. Réessayer dans 30s."
fi

# =============================================================================
# Récap
# =============================================================================
cyan "✅  Setup terminé"
echo
echo "Service        : sudo systemctl status besu"
echo "Logs           : sudo journalctl -u besu -f"
echo "Healthcheck    : $REPO_DIR/scripts/health-check.sh"
echo
echo "Endpoints internes (loopback uniquement) :"
echo "  RPC HTTP     : http://127.0.0.1:8545"
echo "  WebSocket    : ws://127.0.0.1:8546"
echo "  Métriques    : http://127.0.0.1:9545/metrics"
echo
echo "🔧 Étape suivante : exposer les RPC publiquement via DirectAdmin."
echo "   Voir : $REPO_DIR/docs/HOSTINGER_DIRECTADMIN.md"
echo
