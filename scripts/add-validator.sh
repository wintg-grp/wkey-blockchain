#!/usr/bin/env bash
# =============================================================================
# add-validator.sh — Ajoute un validateur via vote IBFT
# =============================================================================
# À exécuter sur CHAQUE validateur existant (le vote est comptabilisé quand
# une majorité a voté).
#
# Usage : ./scripts/add-validator.sh 0xNouvelleAdresse
# =============================================================================
set -euo pipefail

NEW_VALIDATOR="${1:-}"
RPC="${RPC:-http://127.0.0.1:8545}"

if [[ ! "$NEW_VALIDATOR" =~ ^0x[a-fA-F0-9]{40}$ ]]; then
  echo "Usage: $0 <0x...adresse-checksum-40>" >&2
  exit 1
fi

echo "▶ Soumission vote 'ajouter $NEW_VALIDATOR' sur $RPC..."
RESPONSE=$(curl -s -X POST -H "Content-Type: application/json" \
  --data "{\"jsonrpc\":\"2.0\",\"method\":\"ibft_proposeValidatorVote\",\"params\":[\"${NEW_VALIDATOR}\",true],\"id\":1}" \
  "$RPC")
echo "Réponse : $RESPONSE"

# Vérifier les votes pendants
echo
echo "▶ Votes pendants :"
curl -s -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"ibft_getPendingVotes","params":[],"id":1}' \
  "$RPC" | jq .

# Validateurs actuels
echo
echo "▶ Validateurs actuels :"
curl -s -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"ibft_getValidatorsByBlockNumber","params":["latest"],"id":1}' \
  "$RPC" | jq .

cat <<EOF

═══════════════════════════════════════════════════════════════════════
ℹ️  Le nouveau validateur sera ajouté quand la MAJORITÉ des validateurs
   actuels aura voté. Avec N validateurs, il en faut floor(2*N/3) + 1.

   Pour retirer un validateur, mettre 'false' à la place de 'true'.

   Ne pas oublier d'ajouter aussi son enode dans permissions_config.toml
   et de redémarrer Besu si besoin.
═══════════════════════════════════════════════════════════════════════
EOF
