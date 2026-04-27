#!/usr/bin/env bash
# =============================================================================
# install-dual.sh — Install Besu mainnet AND testnet on the same host
# =============================================================================
# Designed for AlmaLinux 9 / Rocky 9 / RHEL 9 (Hostinger VPS with DirectAdmin),
# but also works on Ubuntu 22.04 LTS (auto-detected).
#
# Prerequisites:
#   - Fresh server (or one that's been wiped via cleanup-server.sh)
#   - 8 vCPU, 16 GB RAM, 200 GB SSD recommended
#   - Root access
#   - The repository checked out at $(pwd)/.. with both
#       besu/genesis.mainnet.json
#       besu/genesis.testnet.json
#     already generated (run generate-genesis on your laptop first).
#
# Port allocation:
#   Mainnet  P2P 30303  RPC 8545  WS 8546  metrics 9545
#   Testnet  P2P 30304  RPC 8547  WS 8548  metrics 9546
#
# Usage:
#   sudo ./scripts/install-dual.sh
# =============================================================================
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BESU_VERSION="${BESU_VERSION:-26.4.0}"
BESU_HOME="/opt/besu/${BESU_VERSION}"
BESU_USER="besu"

step()  { printf "\n\033[1;36m▶ %s\033[0m\n" "$*"; }
ok()    { printf "  \033[1;32m✓\033[0m %s\n" "$*"; }
warn()  { printf "  \033[1;33m!\033[0m %s\n" "$*"; }
die()   { printf "  \033[1;31m✖\033[0m %s\n" "$*" >&2; exit 1; }

[ "$EUID" -eq 0 ] || die "Must run as root."

# -----------------------------------------------------------------------------
step "0/9 — Detecting OS"
OS_ID=""
if [ -f /etc/os-release ]; then
  . /etc/os-release
  OS_ID="${ID:-}"
fi
case "$OS_ID" in
  almalinux|rhel|rocky|centos|fedora) PKG=dnf; FAMILY=rhel ;;
  ubuntu|debian)                       PKG=apt; FAMILY=deb ;;
  *) die "Unsupported OS: $OS_ID" ;;
esac
ok "Detected $NAME ($FAMILY family)"

# -----------------------------------------------------------------------------
step "1/9 — Verifying genesis files exist"
for net in mainnet testnet; do
  f="$REPO_DIR/besu/genesis.${net}.json"
  [ -f "$f" ] || die "Missing $f — run 'npm run generate-genesis -- --network $net' from your laptop first"
  ok "Found genesis.${net}.json"
done

# -----------------------------------------------------------------------------
step "2/9 — Installing OS dependencies"
if [ "$FAMILY" = "rhel" ]; then
  dnf install -y -q wget curl jq java-21-openjdk-headless
else
  apt-get update -qq
  apt-get install -y -qq wget curl jq openjdk-21-jre-headless
fi
ok "Java 21 and tooling installed"

# -----------------------------------------------------------------------------
step "3/9 — Creating besu user"
if ! id "$BESU_USER" &>/dev/null; then
  useradd -r -s /usr/sbin/nologin -m -d "/var/lib/besu" "$BESU_USER"
  ok "Created user '$BESU_USER'"
else
  ok "User '$BESU_USER' already exists"
fi

# -----------------------------------------------------------------------------
step "4/9 — Installing Hyperledger Besu ${BESU_VERSION}"
if [ ! -d "$BESU_HOME" ]; then
  mkdir -p /opt/besu
  TMP_TARBALL="/tmp/besu-${BESU_VERSION}.tar.gz"
  wget -q --show-progress \
    "https://github.com/hyperledger/besu/releases/download/${BESU_VERSION}/besu-${BESU_VERSION}.tar.gz" \
    -O "$TMP_TARBALL"
  tar -xzf "$TMP_TARBALL" -C /opt/besu
  rm -f "$TMP_TARBALL"
  ok "Besu installed in $BESU_HOME"
else
  ok "Besu ${BESU_VERSION} already installed"
fi

ln -sfn "$BESU_HOME" /opt/besu/current
ln -sfn /opt/besu/current/bin/besu /usr/local/bin/besu
ok "Symlinks /opt/besu/current and /usr/local/bin/besu set"

# -----------------------------------------------------------------------------
step "5/9 — Layout: /etc/besu/{mainnet,testnet} and /var/lib/besu/{mainnet,testnet}"
for net in mainnet testnet; do
  mkdir -p "/etc/besu/${net}/keys"
  mkdir -p "/var/lib/besu/${net}"
  cp "$REPO_DIR/besu/genesis.${net}.json"  "/etc/besu/${net}/genesis.json"
  cp "$REPO_DIR/besu/config.${net}.toml"   "/etc/besu/${net}/config.toml"
  cp "$REPO_DIR/besu/static-nodes.json"    "/etc/besu/${net}/static-nodes.json" 2>/dev/null \
    || echo "[]" > "/etc/besu/${net}/static-nodes.json"
  ok "Configured /etc/besu/${net}/"
done

mkdir -p /var/log/besu
chown -R "$BESU_USER:$BESU_USER" /etc/besu /var/lib/besu /var/log/besu
chmod 700 /etc/besu/mainnet/keys /etc/besu/testnet/keys

# -----------------------------------------------------------------------------
step "6/9 — Generating per-network validator keys (if not already present)"
for net in mainnet testnet; do
  KEY="/etc/besu/${net}/keys/key"
  if [ ! -f "$KEY" ]; then
    sudo -u "$BESU_USER" besu --data-path="/var/lib/besu/${net}" \
      public-key export --to="/etc/besu/${net}/keys/key.pub" >/dev/null
    cp "/var/lib/besu/${net}/key" "$KEY"
    chmod 600 "$KEY"
    chown "$BESU_USER:$BESU_USER" "$KEY"
    ADDR=$(sudo -u "$BESU_USER" besu --data-path="/var/lib/besu/${net}" \
      public-key export-address 2>/dev/null | tail -1)
    echo "$ADDR" > "/etc/besu/${net}/keys/address"
    ok "Generated ${net} key — validator address: $ADDR"
  else
    ok "${net} key already present (not overwritten)"
  fi
done

cat <<'EOF'

  ⚠️  IMPORTANT — the addresses above must match the validator addresses
      baked into the corresponding genesis file's extraData. If you generated
      the genesis on a different machine or with a different deployer, regenerate
      it now with these addresses and re-run this installer.

EOF

# -----------------------------------------------------------------------------
step "7/9 — Installing systemd units"
for net in mainnet testnet; do
  install -m 644 "$REPO_DIR/scripts/systemd/besu-${net}.service" \
    "/etc/systemd/system/besu-${net}.service"
  ok "Installed besu-${net}.service"
done
systemctl daemon-reload
systemctl enable besu-mainnet besu-testnet
ok "Both services enabled"

# -----------------------------------------------------------------------------
step "8/9 — Firewall (CSF or firewalld or UFW)"
PORTS_TCP="30303 30304"
PORTS_UDP="30303 30304"

if command -v csf >/dev/null 2>&1; then
  for p in $PORTS_TCP; do
    grep -q "^TCP_IN.*\b${p}\b" /etc/csf/csf.conf || \
      sed -i "s/^TCP_IN = \"/TCP_IN = \"${p},/" /etc/csf/csf.conf
  done
  for p in $PORTS_UDP; do
    grep -q "^UDP_IN.*\b${p}\b" /etc/csf/csf.conf || \
      sed -i "s/^UDP_IN = \"/UDP_IN = \"${p},/" /etc/csf/csf.conf
  done
  csf -r >/dev/null
  ok "CSF reloaded with P2P ports open"
elif systemctl is-active --quiet firewalld; then
  for p in $PORTS_TCP; do firewall-cmd --quiet --permanent --add-port="${p}/tcp"; done
  for p in $PORTS_UDP; do firewall-cmd --quiet --permanent --add-port="${p}/udp"; done
  firewall-cmd --quiet --reload
  ok "firewalld reloaded with P2P ports open"
elif command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  for p in $PORTS_TCP; do ufw allow "${p}/tcp" >/dev/null; done
  for p in $PORTS_UDP; do ufw allow "${p}/udp" >/dev/null; done
  ok "UFW updated with P2P ports open"
else
  warn "No supported firewall detected — open 30303/tcp+udp and 30304/tcp+udp manually"
fi

# Restart Docker if present, in case CSF/firewall reload broke its iptables
if systemctl is-active --quiet docker; then
  systemctl restart docker
  ok "Docker restarted (in case the firewall reload reset its iptables chain)"
fi

# -----------------------------------------------------------------------------
step "9/9 — Starting both networks"
systemctl start besu-mainnet
systemctl start besu-testnet
sleep 5

for net in mainnet testnet; do
  if systemctl is-active --quiet "besu-${net}"; then
    ok "besu-${net} running"
  else
    warn "besu-${net} not running yet — check 'journalctl -u besu-${net} -n 50'"
  fi
done

cat <<EOF

═══════════════════════════════════════════════════════════════════════
  Done. Both networks should now be producing blocks.

  Mainnet : RPC 127.0.0.1:8545   WS 127.0.0.1:8546   metrics :9545
  Testnet : RPC 127.0.0.1:8547   WS 127.0.0.1:8548   metrics :9546

  Validator addresses:
    mainnet : $(cat /etc/besu/mainnet/keys/address 2>/dev/null || echo "?")
    testnet : $(cat /etc/besu/testnet/keys/address 2>/dev/null || echo "?")

  Next:
    - Configure the reverse proxy (DirectAdmin custom OLS template) to expose
      rpc.wintg.network → 8545, ws.wintg.network → 8546, scan.wintg.network,
      and the testnet equivalents.
    - SSL via Let's Encrypt for each subdomain.
    - Logs: journalctl -u besu-mainnet -f
═══════════════════════════════════════════════════════════════════════
EOF
