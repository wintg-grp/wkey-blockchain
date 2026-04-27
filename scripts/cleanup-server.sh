#!/usr/bin/env bash
# =============================================================================
# cleanup-server.sh — Wipe a previous WINTG install before redeploying
# =============================================================================
# Stops every running service, drops the container set, removes /etc/besu,
# /var/lib/besu and /var/log/besu, and unbinds the firewall rules we'd added.
#
# This is destructive. Run it ONLY when you intend to reinstall from scratch.
# Backups of validator keys (/etc/besu/**/keys/) are written to
# /root/wintg-cleanup-backup-<timestamp>/ before wiping.
#
# Usage: sudo ./scripts/cleanup-server.sh
# =============================================================================
set -euo pipefail

[ "$EUID" -eq 0 ] || { echo "Must run as root (sudo)." >&2; exit 1; }

BACKUP_DIR="/root/wintg-cleanup-backup-$(date +%Y%m%d-%H%M%S)"

step() { printf "\n\033[1;36m▶ %s\033[0m\n" "$*"; }
ok()   { printf "  \033[1;32m✓\033[0m %s\n" "$*"; }
warn() { printf "  \033[1;33m!\033[0m %s\n" "$*"; }

# -----------------------------------------------------------------------------
step "1/7 — Backup of validator keys (if any)"
mkdir -p "$BACKUP_DIR"
if [ -d /etc/besu ]; then
  cp -a /etc/besu "$BACKUP_DIR/etc-besu" 2>/dev/null || true
  ok "Saved /etc/besu → $BACKUP_DIR/etc-besu"
else
  warn "No /etc/besu found"
fi

# -----------------------------------------------------------------------------
step "2/7 — Stopping besu services"
for svc in besu besu-mainnet besu-testnet besu-rpc besu-standby; do
  if systemctl list-unit-files "${svc}.service" --quiet >/dev/null 2>&1 && \
     systemctl is-enabled "${svc}.service" >/dev/null 2>&1; then
    systemctl stop "$svc" 2>/dev/null || true
    systemctl disable "$svc" 2>/dev/null || true
    rm -f "/etc/systemd/system/${svc}.service"
    ok "Removed $svc.service"
  fi
done
systemctl daemon-reload

# -----------------------------------------------------------------------------
step "3/7 — Removing Besu data and configuration"
rm -rf /etc/besu /var/lib/besu /var/log/besu
ok "Wiped /etc/besu, /var/lib/besu, /var/log/besu"

# -----------------------------------------------------------------------------
step "4/7 — Stopping Blockscout / explorer containers (if present)"
if command -v docker >/dev/null 2>&1; then
  for stack_dir in /opt/wintg/explorer /opt/wintg-blockchain/explorer /opt/blockscout; do
    if [ -f "$stack_dir/docker-compose.yml" ] || [ -f "$stack_dir/docker-compose.override.yml" ]; then
      (cd "$stack_dir" && docker compose down -v 2>/dev/null) || true
      ok "Stopped stack at $stack_dir"
    fi
  done
  # Catch any orphan containers
  for c in $(docker ps -aq --filter "name=wintg" 2>/dev/null); do
    docker rm -f "$c" >/dev/null 2>&1 || true
  done
  for v in $(docker volume ls -q --filter "name=wintg" 2>/dev/null); do
    docker volume rm "$v" >/dev/null 2>&1 || true
  done
  ok "Cleaned WINTG-related containers and volumes"
else
  warn "Docker not installed — skipping"
fi

# -----------------------------------------------------------------------------
step "5/7 — Removing /opt/wintg* deployment trees"
for d in /opt/wintg /opt/wintg-blockchain /opt/wkey-blockchain; do
  if [ -d "$d" ]; then
    rm -rf "$d"
    ok "Removed $d"
  fi
done

# -----------------------------------------------------------------------------
step "6/7 — Reverting firewall rules (CSF / UFW best-effort)"
# Old testnet ports were 30303 P2P. We'll re-add them in the new install.
if command -v csf >/dev/null 2>&1; then
  warn "CSF detected — review /etc/csf/csf.conf manually if needed"
  warn "  TCP_IN / UDP_IN may still contain 30303 — that's fine, the new install reuses it"
fi
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  for port in 30303/tcp 30303/udp 30304/tcp 30304/udp 8545 8546 8547 8548 9545 9546; do
    ufw delete allow "$port" 2>/dev/null || true
  done
  ok "Removed UFW rules for old Besu ports"
fi

# -----------------------------------------------------------------------------
step "7/7 — Removing besu binary symlinks (will be reinstalled)"
rm -f /usr/local/bin/besu /opt/besu/current 2>/dev/null || true
ok "Removed /usr/local/bin/besu and /opt/besu/current"

# -----------------------------------------------------------------------------
echo
echo "═══════════════════════════════════════════════════════════════════════"
echo "  Cleanup done."
echo "  Validator-key backup at: $BACKUP_DIR"
echo "  Next: re-clone the repo and run the dual-network installer."
echo "═══════════════════════════════════════════════════════════════════════"
