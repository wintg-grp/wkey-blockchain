#!/usr/bin/env bash
# =============================================================================
# health-check.sh — Vérification complète d'un nœud WINTG (Besu)
# =============================================================================
# Vérifie :
#   - Service systemd actif
#   - RPC répond
#   - Production de blocs (delta block_number > 0 sur 10s)
#   - Sync status
#   - Peers > 0 (sauf phase bootstrap solo)
#   - Espace disque < 80 %
#   - Métriques Prometheus accessibles
#
# Code retour : 0 si tout OK, 1 si au moins un check échoue.
# =============================================================================
set -uo pipefail

RPC="${RPC:-http://127.0.0.1:8545}"
METRICS="${METRICS:-http://127.0.0.1:9545/metrics}"
DATA_DIR="${DATA_DIR:-/var/lib/besu/data}"
SERVICE="${SERVICE:-besu}"

PASS=0; FAIL=0
green()  { printf "\033[1;32m✓\033[0m %s\n" "$*"; PASS=$((PASS+1)); }
red()    { printf "\033[1;31m✖\033[0m %s\n" "$*" >&2; FAIL=$((FAIL+1)); }
info()   { printf "  %s\n" "$*"; }

# 1. systemd
if systemctl is-active --quiet "$SERVICE" 2>/dev/null; then
  green "Service systemd '$SERVICE' actif"
else
  red "Service systemd '$SERVICE' inactif"
fi

# 2. RPC
if RPC_BLOCK=$(curl -s --max-time 3 -X POST -H "Content-Type: application/json" \
    --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' "$RPC" \
    | jq -r '.result // empty'); then
  if [ -n "$RPC_BLOCK" ]; then
    green "RPC répond — bloc courant : $((RPC_BLOCK)) ($RPC_BLOCK)"
  else
    red "RPC ne renvoie pas de bloc"
  fi
else
  red "RPC injoignable sur $RPC"
fi

# 3. Production de blocs (delta sur 10s)
B1="$RPC_BLOCK"
sleep 10
B2=$(curl -s --max-time 3 -X POST -H "Content-Type: application/json" \
    --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' "$RPC" \
    | jq -r '.result // empty')
if [ -n "$B1" ] && [ -n "$B2" ] && [ $((B2)) -gt $((B1)) ]; then
  DELTA=$(( B2 - B1 ))
  green "Production blocs OK ($DELTA blocs en 10s)"
else
  red "Pas de nouveau bloc en 10s (B1=$B1 B2=$B2)"
fi

# 4. Sync status
SYNC=$(curl -s -X POST -H "Content-Type: application/json" \
    --data '{"jsonrpc":"2.0","method":"eth_syncing","params":[],"id":1}' "$RPC" | jq -r '.result')
if [ "$SYNC" = "false" ]; then
  green "Sync : à jour (eth_syncing = false)"
else
  red "Sync : EN COURS — $SYNC"
fi

# 5. Peers
PEERS=$(curl -s -X POST -H "Content-Type: application/json" \
    --data '{"jsonrpc":"2.0","method":"net_peerCount","params":[],"id":1}' "$RPC" | jq -r '.result')
if [ -n "$PEERS" ]; then
  N_PEERS=$((PEERS))
  if [ "$N_PEERS" -gt 0 ]; then
    green "Peers : $N_PEERS"
  else
    info "Peers : 0 — OK en phase bootstrap solo, sinon problématique"
  fi
fi

# 6. Validateurs (IBFT)
VALIDATORS=$(curl -s -X POST -H "Content-Type: application/json" \
    --data '{"jsonrpc":"2.0","method":"ibft_getValidatorsByBlockNumber","params":["latest"],"id":1}' \
    "$RPC" | jq -r '.result // empty')
if [ -n "$VALIDATORS" ]; then
  N_VAL=$(echo "$VALIDATORS" | jq 'length')
  green "Validateurs IBFT : $N_VAL"
else
  red "Impossible de récupérer la liste des validateurs"
fi

# 7. Disque
if [ -d "$DATA_DIR" ]; then
  USED_PCT=$(df --output=pcent "$DATA_DIR" | tail -1 | tr -dc '0-9')
  if [ "$USED_PCT" -lt 80 ]; then
    green "Disque : $USED_PCT % utilisé sur $DATA_DIR"
  else
    red "Disque : $USED_PCT % utilisé sur $DATA_DIR (> 80 %)"
  fi
fi

# 8. Métriques Prometheus
if curl -s --max-time 3 "$METRICS" | grep -q "besu_blockchain_height"; then
  green "Métriques Prometheus exposées"
else
  red "Métriques Prometheus inaccessibles sur $METRICS"
fi

echo
if [ "$FAIL" -eq 0 ]; then
  echo "🟢 OK — $PASS checks réussis"
  exit 0
else
  echo "🔴 FAIL — $FAIL/$((PASS+FAIL)) checks échoués"
  exit 1
fi
