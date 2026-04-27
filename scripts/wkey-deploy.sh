#!/usr/bin/env bash
# =============================================================================
# wkey-deploy.sh — Master script de provisioning serveur WINTG/WKey
# =============================================================================
# À exécuter UNE FOIS sur un serveur Ubuntu 22.04 LTS frais (root SSH).
# Installe et configure tout ce qu'il faut pour un nœud WINTG production.
#
# Usage :
#   curl -sSL https://raw.githubusercontent.com/wkey-app/wkey-blockchain/main/scripts/wkey-deploy.sh | sudo bash -s -- mainnet
#   ou
#   sudo ./scripts/wkey-deploy.sh [mainnet|testnet] [validator|standby|rpc]
#
# Pré-requis : DNS configuré (rpc.wintg.network, etc. → IP du serveur)
# =============================================================================
set -euo pipefail

NETWORK="${1:-testnet}"
ROLE="${2:-validator}"

case "$NETWORK" in
  mainnet|testnet) ;;
  *) echo "Network doit être mainnet ou testnet" >&2; exit 1 ;;
esac
case "$ROLE" in
  validator|standby|rpc) ;;
  *) echo "Role doit être validator, standby ou rpc" >&2; exit 1 ;;
esac

[ "$EUID" -eq 0 ] || { echo "Doit être lancé en root (sudo)" >&2; exit 1; }

cyan()  { printf "\033[1;36m%s\033[0m\n" "$*"; }
green() { printf "\033[1;32m✓ %s\033[0m\n" "$*"; }
yellow(){ printf "\033[1;33m⚠ %s\033[0m\n" "$*"; }
red()   { printf "\033[1;31m✖ %s\033[0m\n" "$*" >&2; }

cyan "═══════════════════════════════════════════════════════════════════════"
cyan " WINTG / WKey — Master Deploy Script"
cyan " Network : $NETWORK"
cyan " Role    : $ROLE"
cyan "═══════════════════════════════════════════════════════════════════════"

# -----------------------------------------------------------------------------
# Étape 1 : Mise à jour OS + paquets de base
# -----------------------------------------------------------------------------
cyan "▶ 1/8 — Mise à jour Ubuntu et installation des dépendances"
DEBIAN_FRONTEND=noninteractive apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get upgrade -y -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
  curl wget git jq unzip software-properties-common \
  ufw fail2ban unattended-upgrades \
  ca-certificates gnupg lsb-release \
  build-essential
green "Dépendances installées"

# -----------------------------------------------------------------------------
# Étape 2 : Clone du repo si pas déjà là
# -----------------------------------------------------------------------------
cyan "▶ 2/8 — Code source WINTG"
if [ ! -d /opt/wintg/.git ]; then
  git clone https://github.com/wkey-app/wkey-blockchain.git /opt/wintg
else
  cd /opt/wintg && git pull
fi
chmod +x /opt/wintg/scripts/*.sh
green "Code prêt dans /opt/wintg"

# -----------------------------------------------------------------------------
# Étape 3 : Mises à jour de sécurité automatiques
# -----------------------------------------------------------------------------
cyan "▶ 3/8 — Mises à jour OS automatiques (CVE de sécurité)"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
green "unattended-upgrades activé"

# -----------------------------------------------------------------------------
# Étape 4 : Hardening SSH
# -----------------------------------------------------------------------------
cyan "▶ 4/8 — Hardening SSH"
SSHD_CONF=/etc/ssh/sshd_config
cp -n $SSHD_CONF $SSHD_CONF.bak
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin prohibit-password/' $SSHD_CONF
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' $SSHD_CONF
sed -i 's/^#\?PubkeyAuthentication.*/PubkeyAuthentication yes/' $SSHD_CONF
sed -i 's/^#\?X11Forwarding.*/X11Forwarding no/' $SSHD_CONF
systemctl reload ssh 2>/dev/null || systemctl reload sshd
green "SSH : password disabled, key-only"

# -----------------------------------------------------------------------------
# Étape 5 : Fail2ban
# -----------------------------------------------------------------------------
cyan "▶ 5/8 — Fail2ban"
cat > /etc/fail2ban/jail.local <<'EOF'
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 3

[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
EOF
systemctl enable --now fail2ban
green "Fail2ban actif"

# -----------------------------------------------------------------------------
# Étape 6 : Lancer le setup Besu approprié
# -----------------------------------------------------------------------------
cyan "▶ 6/8 — Bootstrap nœud Besu (rôle: $ROLE)"
case "$ROLE" in
  validator) /opt/wintg/scripts/setup-validator.sh "$NETWORK" ;;
  standby)   /opt/wintg/scripts/setup-standby.sh "$NETWORK" ;;
  rpc)       /opt/wintg/scripts/setup-rpc.sh "$NETWORK" ;;
esac
green "Besu installé et démarré"

# -----------------------------------------------------------------------------
# Étape 7 : Docker (pour Blockscout / monitoring sur le serveur RPC)
# -----------------------------------------------------------------------------
if [ "$ROLE" = "rpc" ]; then
  cyan "▶ 7/8 — Docker (pour Blockscout + monitoring)"
  if ! command -v docker &>/dev/null; then
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
    apt-get update -qq
    apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    systemctl enable --now docker
    green "Docker installé"
  else
    green "Docker déjà installé"
  fi
fi

# -----------------------------------------------------------------------------
# Étape 8 : Healthcheck
# -----------------------------------------------------------------------------
cyan "▶ 8/8 — Healthcheck final"
sleep 10
if /opt/wintg/scripts/health-check.sh; then
  green "Healthcheck OK"
else
  yellow "Healthcheck a échoué — vérifier les logs : journalctl -u besu -n 50"
fi

# -----------------------------------------------------------------------------
# Récap final
# -----------------------------------------------------------------------------
cyan ""
cyan "═══════════════════════════════════════════════════════════════════════"
cyan " ✅  Setup terminé pour $ROLE sur $NETWORK"
cyan "═══════════════════════════════════════════════════════════════════════"
echo
echo "Prochaines étapes :"
case "$ROLE" in
  validator)
    echo "  - Vérifier production de blocs : sudo journalctl -u besu -f"
    echo "  - Healthcheck            : /opt/wintg/scripts/health-check.sh"
    echo "  - Backup clé validateur  : sudo /opt/wintg/scripts/backup-keys.sh"
    ;;
  standby)
    echo "  - Vérifier sync : eth_syncing doit passer à false en quelques heures"
    echo "  - En cas de panne primaire : /opt/wintg/scripts/promote-standby.sh"
    ;;
  rpc)
    DOMAIN=$([ "$NETWORK" = "mainnet" ] && echo "rpc.wintg.network" || echo "testnet-rpc.wintg.network")
    echo "  - Configurer TLS (1ère fois) :"
    echo "      sudo certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m admin@wintg.group"
    echo "  - Lancer Blockscout :"
    echo "      cd /opt/wintg/explorer && cp .env.example .env"
    echo "      docker compose up -d"
    echo "  - Lancer monitoring :"
    echo "      cd /opt/wintg/monitoring && cp .env.example .env"
    echo "      docker compose up -d"
    ;;
esac
echo
echo "Documentation : /opt/wintg/docs/"
echo "Guide complet : /opt/wintg/GO_LIVE.md"
echo
