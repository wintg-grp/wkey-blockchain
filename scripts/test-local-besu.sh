#!/usr/bin/env bash
# =============================================================================
# test-local-besu.sh — Démarrage local complet avec Besu réel (Docker)
# =============================================================================
# Lance la STACK COMPLÈTE en local :
#   - Besu IBFT 2.0 (chaîne réelle, comme en production)
#   - Blockscout (block explorer)
#   - Faucet (testnet faucet)
#   - PostgreSQL + Redis (pour Blockscout)
#
# Puis déploie les 18 contrats sur cette chaîne locale.
#
# Pré-requis : Docker Desktop installé.
#
# Usage : ./scripts/test-local-besu.sh
# =============================================================================
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

echo "📦 Vérification de Docker..."
if ! command -v docker &>/dev/null; then
  echo "✖ Docker n'est pas installé. Voir https://docs.docker.com/get-docker/" >&2
  exit 1
fi

echo "✓ Docker $(docker --version)"
echo

echo "🚀 Démarrage de la stack locale (Besu + Blockscout + Faucet)..."
docker compose -f docker-compose.local.yml up -d
echo

echo "⏳ Attente du démarrage de Besu (peut prendre 30s)..."
for i in $(seq 1 60); do
  if curl -s --max-time 2 -X POST http://127.0.0.1:8545 \
       -H "Content-Type: application/json" \
       -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
       2>/dev/null | grep -q result; then
    echo "✓ Besu opérationnel"
    break
  fi
  sleep 1
  if [ $((i % 10)) -eq 0 ]; then
    echo "  ... ($i s)"
  fi
done

# Vérifier que la chaîne produit bien des blocs
echo
echo "▶ Test de production de blocs..."
B1=$(curl -s -X POST http://127.0.0.1:8545 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' | jq -r '.result')
echo "  Bloc actuel : $((B1))"
sleep 5
B2=$(curl -s -X POST http://127.0.0.1:8545 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' | jq -r '.result')
echo "  Bloc après 5s : $((B2))"
if [ $((B2)) -gt $((B1)) ]; then
  echo "✓ La chaîne produit des blocs ($((B2 - B1)) en 5s, ~$(((B2 - B1) * 60 / 5)) /min)"
else
  echo "⚠ Aucun bloc produit en 5s. Vérifier les logs : docker compose -f docker-compose.local.yml logs besu"
fi

echo
echo "🚀 Déploiement des contrats..."
cd contracts
[ -d node_modules ] || npm install --silent
npx hardhat compile --quiet 2>&1 | tail -3
npx hardhat run scripts/deploy-local.ts --network local

echo
echo "═══════════════════════════════════════════════════════════════════════"
echo "✅ STACK LOCALE COMPLÈTE PRÊTE"
echo "═══════════════════════════════════════════════════════════════════════"
echo
echo "🌐 Endpoints :"
echo "  RPC          : http://localhost:8545"
echo "  WS           : ws://localhost:8546"
echo "  Métriques    : http://localhost:9545/metrics"
echo "  Block Explorer (Blockscout)"
echo "               : http://localhost:4000  (indexation initiale ~60s)"
echo "  Faucet API   : http://localhost:3030/api/health"
echo
echo "🔑 Connexion MetaMask :"
echo "  Network Name : WINTG Local"
echo "  RPC URL      : http://127.0.0.1:8545"
echo "  Chain ID     : 22800"
echo "  Symbol       : WTG"
echo "  Block Explorer: http://localhost:4000"
echo
echo "💰 Comptes de test (clés Hardhat — connues, DEV ONLY) :"
echo "  Validator + Deployer (1 milliard WTG) :"
echo "    Address : 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
echo "    Key     : 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
echo "  User accounts (100k WTG chacun) :"
echo "    0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
echo "    0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
echo "    0x90F79bf6EB2c4f870365E785982E1f101E93b906"
echo
echo "📁 Adresses contrats : contracts/deployments/local-local.json"
echo
echo "🛑 Pour arrêter :"
echo "  docker compose -f docker-compose.local.yml down       # garde les données"
echo "  docker compose -f docker-compose.local.yml down -v    # tout cleanup"
echo
echo "📜 Logs en temps réel :"
echo "  docker compose -f docker-compose.local.yml logs -f besu"
echo
