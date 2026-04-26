# Hostinger VPS + DirectAdmin + Besu — Guide cohabitation

Ce guide explique comment faire **cohabiter** la blockchain WINTG (Besu)
avec ton DirectAdmin existant sur un VPS Hostinger AlmaLinux 9.

> **Idée** : DirectAdmin garde le contrôle de Nginx + SSL pour tous tes
> sous-domaines. On ajoute juste `chain.wkey.app`, `explorer.wkey.app`
> etc. comme **domaines normaux** dans DirectAdmin, qui seront proxyés
> en interne vers Besu (loopback localhost).

---

## 1. Vérifier ton VPS

```bash
ssh root@72.61.231.11

# Specs
nproc                          # 4 (KVM 4)
free -h | grep Mem             # ~15 Gi (KVM 4)
df -h /                        # ~200 G

# Services DirectAdmin déjà en place
systemctl status directadmin   # actif sur :2222
systemctl status nginx         # actif sur :80, :443
systemctl status mysqld        # bdd
systemctl status named         # DNS local (pour DA)

# Ports occupés
ss -tlnp | head -20
```

Si tout est OK, on peut continuer.

---

## 2. Cloner le repo WINTG sur le serveur

```bash
cd /opt
git clone https://github.com/wkey-app/wkey-blockchain.git wintg
cd wintg
chmod +x scripts/*.sh
```

---

## 3. Installer Besu (en parallèle de DirectAdmin)

```bash
sudo bash /opt/wintg/scripts/install-besu-almalinux.sh testnet validator
```

Ce script :
- Télécharge Hyperledger Besu 26.4.0 dans `/opt/besu-26.4.0/`
- Crée user `besu` (séparé du user DirectAdmin)
- Configure firewalld (ports 30303 ouverts pour P2P)
- Crée le service systemd `besu`
- **Ne touche PAS à Nginx, Apache, MySQL ou DirectAdmin**

À la fin :
```bash
sudo systemctl status besu        # actif
sudo journalctl -u besu -f        # voir les logs
```

Test RPC interne (loopback uniquement) :
```bash
curl -X POST http://127.0.0.1:8545 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
```

---

## 4. Ajouter les sous-domaines dans DirectAdmin

Connecte-toi à DirectAdmin : `https://srv1161785.hstgr.cloud:2222` (ou ton IP).

Pour chaque sous-domaine, fais ces étapes :

### 4.1 — Ajouter `testnet-rpc.wkey.app` comme domaine

1. **Panneau utilisateur** (admin@wkey.app par défaut)
2. **Account Manager → Domain Setup** → **Add Another Domain**
3. Nouveau domaine : `testnet-rpc.wkey.app`
4. Use IP shared : ✅
5. Allow SSL : ✅
6. PHP : ❌ (non, c'est juste un proxy)
7. **Create**

Répète pour :
- `testnet-ws.wkey.app`
- `testnet-explorer.wkey.app`
- `chain.wkey.app` (mainnet futur)
- `ws.wkey.app`
- `explorer.wkey.app`
- `faucet.wkey.app`

### 4.2 — Activer SSL Let's Encrypt pour chacun

Dans DirectAdmin, pour chaque domaine :
1. **SSL Certificates**
2. **Free & automatic certificate from Let's Encrypt**
3. Inclure `www.testnet-rpc.wkey.app` ❌ (pas besoin pour RPC)
4. **Save**

DirectAdmin génère le certificat automatiquement (peut prendre 1-2 min).

### 4.3 — Configurer le reverse proxy

Pour chaque domaine, on doit dire à Nginx (managé par DirectAdmin) de
proxyer vers Besu en interne. DirectAdmin permet d'ajouter des **custom
configs** par domaine.

**SSH sur le serveur** et fais ça pour `testnet-rpc.wkey.app` :

```bash
# Localiser la conf Nginx du domaine (DirectAdmin l'a créée)
DOMAIN="testnet-rpc.wkey.app"
USER="admin"  # ou ton user DA

# Créer un custom snippet
mkdir -p /usr/local/directadmin/data/users/$USER/nginx_custom/$DOMAIN/
cat > /usr/local/directadmin/data/users/$USER/nginx_custom/$DOMAIN/server_https.CUSTOM.pre <<'NGINX'
    # Reverse proxy vers Besu RPC
    location / {
        proxy_pass http://127.0.0.1:8545;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Headers pour CORS (dApps depuis n'importe où)
        add_header Access-Control-Allow-Origin "*" always;
        add_header Access-Control-Allow-Methods "POST, OPTIONS" always;
        add_header Access-Control-Allow-Headers "Content-Type" always;

        if ($request_method = OPTIONS) { return 204; }

        # Rate limit anti-spam
        limit_req zone=rpc_limit burst=60 nodelay;
    }
NGINX

# Recharger DirectAdmin / Nginx
cd /usr/local/directadmin/custombuild
./build rewrite_confs
systemctl reload nginx
```

Pour `testnet-ws.wkey.app` (WebSocket) :

```bash
DOMAIN="testnet-ws.wkey.app"
cat > /usr/local/directadmin/data/users/$USER/nginx_custom/$DOMAIN/server_https.CUSTOM.pre <<'NGINX'
    location / {
        proxy_pass http://127.0.0.1:8546;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }
NGINX

cd /usr/local/directadmin/custombuild && ./build rewrite_confs
systemctl reload nginx
```

Pour `testnet-explorer.wkey.app` (Blockscout, on l'installera après) :

```bash
DOMAIN="testnet-explorer.wkey.app"
cat > /usr/local/directadmin/data/users/$USER/nginx_custom/$DOMAIN/server_https.CUSTOM.pre <<'NGINX'
    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket support pour les live updates
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
NGINX

cd /usr/local/directadmin/custombuild && ./build rewrite_confs
systemctl reload nginx
```

### 4.4 — Configurer le rate limit zone (1 fois)

Dans la conf Nginx globale de DirectAdmin :

```bash
# Trouver le fichier nginx.conf principal
NGINXCONF="/etc/nginx/nginx.conf"

# Ajouter le rate limit zone si pas déjà présent
if ! grep -q "rpc_limit" "$NGINXCONF"; then
  # Insérer dans le bloc http {} (chercher la ligne "http {")
  sed -i '/^http {/a \    limit_req_zone $binary_remote_addr zone=rpc_limit:10m rate=30r\/s;' "$NGINXCONF"
fi

systemctl reload nginx
```

---

## 5. Tester depuis l'extérieur

Une fois DNS propagé (5-30 min après config) :

```bash
# Depuis ton PC local
curl -X POST https://testnet-rpc.wkey.app \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}'
# Attendu : {"jsonrpc":"2.0","id":1,"result":"0x5910"}  (0x5910 = 22800 testnet)

# Le bloc augmente toutes les 3s
curl -X POST https://testnet-rpc.wkey.app \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
```

Si ça marche → **ta blockchain est en ligne sur testnet** 🎉

---

## 6. Connecter MetaMask

Réseau personnalisé :
| Champ | Valeur |
|---|---|
| Network Name | WINTG Testnet |
| RPC URL | `https://testnet-rpc.wkey.app` |
| Chain ID | `22800` |
| Symbol | `WTG` |
| Block Explorer | `https://testnet-explorer.wkey.app` |

Importer un compte test : la **Hardhat account 0** (clé connue, **NE PAS UTILISER EN MAINNET**) :
- Address : `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`
- Private Key : `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`

Tu as **1 milliard WTG** sur ce compte (pré-allocation testnet). Tu peux envoyer du WTG à n'importe qui pour tester.

---

## 7. Déployer les smart contracts

Depuis ton **PC local** (pas le serveur) :

```bash
cd C:\wintg-blockchain\contracts

# .env doit pointer vers ton testnet
cat > ../.env <<'EOF'
RPC_URL_TESTNET=https://testnet-rpc.wkey.app
DEPLOYER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
TREASURY_SIGNERS=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
TREASURY_THRESHOLD=1
EOF

# Déployer (les 20 contrats)
npx hardhat run scripts/deploy-local.ts --network wintgTestnet
# OU si tu veux le déploiement complet avec genesis pre-allocations :
# npm run deploy:testnet
```

Adresses sauvegardées dans `contracts/deployments/wintgTestnet-local.json`.

---

## 8. (Optionnel) Installer Blockscout pour `testnet-explorer.wkey.app`

```bash
ssh root@72.61.231.11

# Installer Docker
dnf install -y dnf-plugins-core
dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
systemctl enable --now docker

# Lancer Blockscout
cd /opt/wintg/explorer
cp .env.example .env

# Éditer .env :
#   WINTG_RPC_URL=http://172.17.0.1:8545   (172.17.0.1 = host depuis Docker)
#   WINTG_WS_URL=ws://172.17.0.1:8546
#   CHAIN_ID=22800
#   DB_PASSWORD=<random>
#   SECRET_KEY_BASE=<openssl rand -base64 64>

docker compose up -d
docker compose logs -f blockscout      # attendre l'indexation, ~5 min
```

À la fin, `https://testnet-explorer.wkey.app` affiche tes blocs et transactions.

---

## 9. Surveillance — vérifier que tout tourne

Healthcheck :
```bash
/opt/wintg/scripts/health-check.sh
```

Résultat attendu :
```
✓ Service systemd 'besu' actif
✓ RPC répond — bloc courant : ...
✓ Production blocs OK (1 bloc en 10s)
✓ Sync : à jour
✓ Validateurs IBFT : 1
✓ Disque : ~10% utilisé
✓ Métriques Prometheus exposées
🟢 OK
```

Logs en temps réel :
```bash
sudo journalctl -u besu -f
```

---

## ❓ Troubleshooting

### "Connection refused" sur `testnet-rpc.wkey.app`

```bash
# Sur le serveur
sudo systemctl status besu        # Besu tourne ?
sudo ss -tlnp | grep 8545         # Port 8545 écoute ?
sudo nginx -t                     # Conf Nginx valide ?
sudo systemctl status nginx       # Nginx tourne ?
```

### DirectAdmin refuse d'ajouter le sous-domaine

→ Vérifier que `wkey.app` est ajouté comme **domaine principal** dans DirectAdmin d'abord, puis les sous-domaines.

### Besu OOM (Out Of Memory)

→ Réduire la heap Java :
```bash
sudo sed -i 's/-Xmx6g/-Xmx4g/g' /etc/systemd/system/besu.service
sudo systemctl daemon-reload && sudo systemctl restart besu
```

### "Too many open files"

```bash
sudo sed -i 's/LimitNOFILE=65536/LimitNOFILE=131072/' /etc/systemd/system/besu.service
sudo systemctl daemon-reload && sudo systemctl restart besu
```

---

## 📋 Checklist mise en ligne testnet

```
[ ] DNS testnet-rpc.wkey.app propagé (dig +short testnet-rpc.wkey.app)
[ ] DNS testnet-ws.wkey.app propagé
[ ] DNS testnet-explorer.wkey.app propagé
[ ] Besu installé via install-besu-almalinux.sh
[ ] Besu produit des blocs (eth_blockNumber augmente)
[ ] Sous-domaines ajoutés dans DirectAdmin
[ ] SSL Let's Encrypt actif sur chaque sous-domaine
[ ] Reverse proxy Nginx custom configuré pour chaque
[ ] testnet-rpc.wkey.app répond (curl -X POST eth_chainId)
[ ] MetaMask se connecte
[ ] Smart contracts déployés
[ ] Blockscout indexé (si installé)
[ ] Healthcheck OK
```

---

> Pour passer en **mainnet**, refaire les mêmes étapes avec :
> - `bash install-besu-almalinux.sh mainnet validator`
> - Sous-domaines : `chain.wkey.app`, `ws.wkey.app`, `explorer.wkey.app`
> - **Mais avant** : audit externe + bug bounty + génération wallets de prod sécurisés.
