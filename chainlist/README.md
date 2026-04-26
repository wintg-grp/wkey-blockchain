# Chainlist Registration

Fichiers JSON conformes au schéma de [ethereum-lists/chains](https://github.com/ethereum-lists/chains) (utilisé par [chainlist.org](https://chainlist.org)).

## Soumission

1. Forker `https://github.com/ethereum-lists/chains`
2. Copier `wintg-mainnet.json` → `_data/chains/eip155-2280.json`
3. Copier `wintg-testnet.json` → `_data/chains/eip155-22800.json`
4. Ouvrir une PR avec :
   - Un seul ajout par chain
   - Tests verts (`npm test`)
   - Lien vers le block explorer fonctionnel
   - Confirmation que `eth_chainId` retourne bien `0x8e8` (2280) sur le RPC

## Déclencheurs automatiques après acceptation

- Apparition sur [chainlist.org](https://chainlist.org)
- Bouton "Add to MetaMask" en 1 clic
- Indexation par DefiLlama, Coingecko (sur demande séparée)
- Wallets compatibles : MetaMask, Rabby, Frame, Trust Wallet
