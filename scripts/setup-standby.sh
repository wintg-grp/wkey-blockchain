#!/usr/bin/env bash
# =============================================================================
# setup-standby.sh — Bootstrap d'un nœud Hot Standby WINTG
# =============================================================================
# Identique à setup-validator.sh mais avec config-standby.toml.
# Le nœud sync la chaîne mais ne mine pas tant qu'il n'est pas promu.
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
ETC_DIR="/etc/besu"
DATA_DIR="/var/lib/besu/data"
LOG_DIR="/var/log/besu"
BESU_USER="besu"

[ "$EUID" -eq 0 ] || { echo "Doit être lancé en root (sudo)." >&2; exit 1; }

# Réutiliser setup-validator.sh pour les étapes 1-5, puis swap config
"$REPO_DIR/scripts/setup-validator.sh" "$NETWORK"

# Remplacer la config par celle du standby
cp "$REPO_DIR/besu/config-standby.toml" "$ETC_DIR/config.toml"
chown "$BESU_USER:$BESU_USER" "$ETC_DIR/config.toml"

# Mise à jour du service systemd avec identité standby
sed -i 's/WINTG Validator/WINTG Hot Standby/' /etc/systemd/system/besu.service
systemctl daemon-reload
systemctl restart besu

echo
echo "✓ Hot Standby actif. Sync en cours (peut prendre plusieurs heures selon la taille de la chaîne)."
echo "  Pour le promouvoir validateur : ./scripts/promote-standby.sh"
