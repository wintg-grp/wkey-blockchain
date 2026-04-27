#!/usr/bin/env bash
# =============================================================================
# promote-standby.sh — Bascule du Hot Standby en validateur actif
# =============================================================================
# À exécuter sur la machine STANDBY quand le validateur primaire est down.
# Procédure :
#   1. Confirmer que le primaire est inaccessible (timeout ping + RPC)
#   2. Soumettre un vote IBFT depuis le standby pour s'ajouter à la liste
#      des validateurs (requiert quorum — donc en phase 1 où il n'y a qu'un
#      seul validateur, ça ne fonctionne pas via vote : il faut redémarrer
#      avec un nouvel extraData).
#
# Phase 1 (1 validateur) : la "promotion" implique de :
#   a. Régénérer le genesis avec le standby comme validateur.
#   b. Redémarrer la chaîne sur le standby (= reset de la chaîne, perte
#      d'historique post-genesis !)
#
# Phase 2+ (≥4 validateurs) : promotion sans interruption via votes IBFT.
# =============================================================================
set -euo pipefail

PRIMARY_RPC="${PRIMARY_RPC:-https://rpc.wintg.network}"
LOCAL_RPC="http://127.0.0.1:8545"

echo "▶ Vérification de l'état du validateur primaire..."
if curl -s --max-time 5 -X POST -H "Content-Type: application/json" \
    --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
    "$PRIMARY_RPC" >/dev/null 2>&1; then
  echo "  ⚠ Le primaire répond. Confirme la bascule avec --force." >&2
  [[ "${1:-}" == "--force" ]] || exit 1
fi

echo "▶ État local du standby :"
LOCAL_BLOCK=$(curl -s -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
  "$LOCAL_RPC" | jq -r '.result' || echo "0x0")
echo "  Bloc courant : $LOCAL_BLOCK"

VALIDATORS=$(curl -s -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"ibft_getValidatorsByBlockNumber","params":["latest"],"id":1}' \
  "$LOCAL_RPC" | jq -r '.result[]' || echo "")
echo "  Validateurs actuels : $VALIDATORS"

# -----------------------------------------------------------------------------
# Phase 1 : redémarrage avec nouveau genesis (rare, casse l'historique)
# Phase 2+ : vote IBFT
# -----------------------------------------------------------------------------
N_VAL=$(echo "$VALIDATORS" | grep -c "0x" || true)
if [ "$N_VAL" -le 1 ]; then
  cat <<MSG

═══════════════════════════════════════════════════════════════════════
⚠️  PHASE BOOTSTRAP — 1 SEUL VALIDATEUR
═══════════════════════════════════════════════════════════════════════
La chaîne ne peut pas continuer sans le primaire (consensus IBFT 2.0).
Procédure :
  1. Régénérer le genesis sur le standby :
     cd contracts && VALIDATORS=<standby_addr> npm run generate-genesis
  2. Effacer le data-path du standby :
     sudo systemctl stop besu
     sudo rm -rf /var/lib/besu/data
  3. Copier le nouveau genesis :
     sudo cp besu/genesis.json /etc/besu/genesis.json
  4. Redémarrer :
     sudo systemctl start besu
  5. Mettre à jour les DNS pour pointer rpc.wintg.network vers ce nœud.

  ⚠️  L'historique de la chaîne pré-bascule est PERDU.
      C'est l'avertissement assumé de la phase bootstrap.
═══════════════════════════════════════════════════════════════════════
MSG
  exit 1
fi

# Phase 2+ : vote IBFT pour s'ajouter
LOCAL_ADDR=$(cat /etc/besu/keys/address)
echo "▶ Soumission du vote IBFT pour ajouter $LOCAL_ADDR aux validateurs..."
curl -s -X POST -H "Content-Type: application/json" \
  --data "{\"jsonrpc\":\"2.0\",\"method\":\"ibft_proposeValidatorVote\",\"params\":[\"$LOCAL_ADDR\",true],\"id\":1}" \
  "$LOCAL_RPC"
echo
echo "▶ Le vote sera comptabilisé au prochain epoch (max 30 000 blocs)."
echo "  Pour les autres validateurs : exécuter le même vote sur leur RPC interne."
