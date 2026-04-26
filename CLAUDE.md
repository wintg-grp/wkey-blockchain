# Projet WINTG — Blockchain Layer 1 souveraine

## Vision
Blockchain L1 souveraine pour le marché africain (Togo → UEMOA), 
ultra-rapide et à frais quasi-nuls. Socle pour un futur écosystème 
(paiements e-commerce, gaming, NFT, remittances Mobile Money).

## Architecture
- **Client** : Hyperledger Besu (dernière version stable)
- **Consensus** : IBFT 2.0 (PoA, finalité instantanée)
- **Chain ID** : 2280
- **Block time** : 3 secondes
- **TPS cible** : 1000+
- **Validateur initial** : 1 (avec hot standby)

## Token Natif WTG
- Nom : WINTG | Symbole : WTG
- Supply : 1 000 000 000 (18 décimales)
- Modèle : Fixe + Burn déflationniste + Inflation staking plafonnée
- Répartition fees : 70% Treasury / 20% Validateurs / 10% Burn

## Stack Technique
- Smart contracts : Solidity 0.8.24+ avec OpenZeppelin v5
- Tests : Hardhat + Foundry (couverture ≥95% obligatoire)
- Block explorer : Blockscout (open-source)
- Monitoring : Prometheus + Grafana
- Langage scripts : TypeScript

## Standards de Code (NON-NÉGOCIABLES)
- Toujours utiliser OpenZeppelin v5 (Ownable2Step, ReentrancyGuard, Pausable)
- Documentation NatSpec sur CHAQUE fonction publique
- Tests unitaires AVANT chaque commit (≥95% coverage)
- Events bien structurés pour traçabilité on-chain
- JAMAIS de secrets en dur (utiliser .env)
- Conventional Commits pour les messages git

## Workflow Préféré
- Réfléchir étape par étape avant de coder (architecture d'abord)
- Vérifier la doc à jour via Context7 avant d'utiliser une lib
- Toujours faire : lint + tests + coverage avant commit
- Code modulaire et réutilisable
- Production-ready, pas du prototype

## Phases du projet
- **Phase 1 (actuelle)** : Blockchain WINTG + Token WTG + Vesting + Block Explorer
- **Phase 2 (futur)** : WPAY Gateway + Mobile Money Bridge
- **Phase 3 (futur)** : DEX + NFT Marketplace + Staking + DAO
- **Phase 4 (futur)** : Apps WKey (Flutter) + Winify (web)

## Notes Importantes
- Démarrage avec 1 validateur unique (phase bootstrap assumée)
- Évolution prévue : ajout validateurs à 6, 12, 24 mois
- Hot standby obligatoire pour résilience
- Backups automatiques des clés validateur (chiffrés AES-256)