#!/usr/bin/env bash
# =============================================================================
# test-local-quick.sh — Démarrage local rapide avec Hardhat (sans Docker)
# =============================================================================
# Lance un nœud Hardhat éphémère + déploie tous les contrats.
# Idéal pour itérer rapidement sur le développement.
#
# Usage : ./scripts/test-local-quick.sh
# =============================================================================
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR/contracts"

echo "📦 Vérif des dépendances..."
if [ ! -d node_modules ]; then
  echo "  Installation npm..."
  npm install --silent
fi

echo "🔨 Compilation..."
npx hardhat compile --quiet

echo
echo "🚀 Démarrage du nœud Hardhat en arrière-plan..."
echo "   (Ctrl+C pour arrêter)"
echo

# Lancer hardhat node en background avec PID tracking
LOGFILE="/tmp/wintg-hardhat-node.log"
npx hardhat node > "$LOGFILE" 2>&1 &
NODE_PID=$!

cleanup() {
  echo
  echo "🛑 Arrêt du nœud Hardhat (PID $NODE_PID)..."
  kill $NODE_PID 2>/dev/null || true
}
trap cleanup EXIT

# Attendre que le RPC soit prêt
echo "⏳ Attente du nœud..."
for i in $(seq 1 30); do
  if curl -s --max-time 1 -X POST http://127.0.0.1:8545 \
       -H "Content-Type: application/json" \
       -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' >/dev/null 2>&1; then
    echo "✓ Nœud prêt sur http://127.0.0.1:8545"
    break
  fi
  sleep 1
done

echo
echo "🚀 Déploiement des 18 contrats..."
echo
npx hardhat run scripts/deploy-local.ts --network localhost

echo
echo "═══════════════════════════════════════════════════════════════════════"
echo "✅ STACK LOCALE PRÊTE"
echo "═══════════════════════════════════════════════════════════════════════"
echo
echo "RPC          : http://127.0.0.1:8545"
echo "Chain ID     : 31337 (Hardhat default)"
echo "Symbol       : WTG (Hardhat l'appelle ETH en interne mais MetaMask affiche ce que tu mets)"
echo
echo "Comptes pré-fundés (10 000 ETH chacun) :"
echo "  Account 0  : 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
echo "    Key      : 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
echo "  Account 1  : 0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
echo "    Key      : 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
echo "  ... (18 autres comptes pré-fundés)"
echo
echo "Adresses des contrats : contracts/deployments/localhost-local.json"
echo
echo "Pour tester avec MetaMask :"
echo "  1. Ajouter le réseau (Settings > Networks > Add Network)"
echo "     - Network Name: WINTG Local"
echo "     - RPC URL: http://127.0.0.1:8545"
echo "     - Chain ID: 31337"
echo "     - Symbol: WTG"
echo "     - Chain ID: 31337"
echo "     - Symbol: ETH"
echo "  2. Importer Account 0 (clé privée ci-dessus)"
echo "  3. Tu as 10 000 ETH pour tester !"
echo
echo "Ctrl+C pour arrêter le nœud Hardhat."
echo

# Garder le processus vivant
wait $NODE_PID
