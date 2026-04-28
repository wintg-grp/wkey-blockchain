# Blockscout — Block Explorer WINTG

Stack Docker pour exposer un block explorer style Etherscan sur la chaîne WINTG.

## Démarrage rapide

```bash
cd explorer
cp .env.example .env

# Éditer .env :
#  - DB_PASSWORD     : générer une string forte (`openssl rand -base64 32`)
#  - SECRET_KEY_BASE : `openssl rand -base64 64`
#  - WINTG_RPC_URL   : pointer vers ton nœud Besu (port 8545)
#  - WINTG_WS_URL    : pointer vers le WebSocket (port 8546)

docker compose up -d
docker compose logs -f blockscout
```

L'explorer écoute sur `http://localhost:4000`. Indexation initiale : 30 min – plusieurs heures selon la taille de la chaîne.

## Configuration recommandée pour mainnet

- **Reverse proxy Nginx + TLS Let's Encrypt** sur `scan.wintg.network`
- **PostgreSQL** : 4 GB RAM minimum, SSD NVMe, 100 GB+
- **Backups** : `pg_dump` quotidien chiffré (voir `scripts/backup-blockscout.sh` à produire)

## Vérification de contrats

Le service `smart-contract-verifier` est exposé sur `:8050`. Le déploiement
auto-vérifie les contrats si `BLOCKSCOUT_API_URL` est défini dans `.env` racine
(via `npx hardhat verify`).

## Endpoints utiles

- UI : `http://localhost:4000`
- API : `http://localhost:4000/api`
- API Eth-compatible : `http://localhost:4000/api/eth-rpc`

## Logs et debug

```bash
docker compose logs blockscout       # backend Phoenix
docker compose logs db               # PostgreSQL
docker compose exec db psql -U blockscout
```

## Arrêt et nettoyage

```bash
docker compose down                  # arrête mais conserve les données
docker compose down -v               # ⚠️ détruit aussi la DB indexée
```
