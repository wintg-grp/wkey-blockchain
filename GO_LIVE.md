# 🚀 Guide de mise en ligne WINTG / WKey

Ce document liste **tout ce qu'il faut faire** pour passer de "code sur ton PC"
à "blockchain WINTG accessible sur internet".

> **Honnêté** : ces étapes nécessitent des actions humaines (acheter serveur,
> configurer DNS, signer multisig). Aucune IA ne peut faire ça à ta place.
> Mais le code, les scripts et la doc sont prêts.

---

## 📋 Vue d'ensemble — 3 phases

```
┌──────────────────────────────────────────────────────┐
│  PHASE 1 — PUBLIER LE CODE (15 min)                  │
│  ✓ Créer compte GitHub                               │
│  ✓ Créer dépôt wkey-blockchain                       │
│  ✓ Push du code                                      │
└────────────────────────┬─────────────────────────────┘
                         │
┌────────────────────────▼─────────────────────────────┐
│  PHASE 2 — INFRASTRUCTURE (2-4 heures)               │
│  ✓ Acheter 1 serveur cloud (~50€/mois)               │
│  ✓ Configurer DNS sur wkey.app                       │
│  ✓ Lancer les scripts de setup                       │
│  ✓ Vérifier que la chaîne produit des blocs          │
└────────────────────────┬─────────────────────────────┘
                         │
┌────────────────────────▼─────────────────────────────┐
│  PHASE 3 — TESTNET PUIS MAINNET (1-2 semaines)       │
│  ✓ Lancer testnet public                             │
│  ✓ Inviter les devs à tester (faucet, dApps)         │
│  ✓ Audit externe (CertiK / Hacken — recommandé)      │
│  ✓ Lancer mainnet + TGE                              │
└──────────────────────────────────────────────────────┘
```

---

# PHASE 1 — Publier le code sur GitHub (15 min)

## Étape 1.1 — Créer un compte GitHub (si pas déjà fait)

→ [https://github.com/signup](https://github.com/signup)

Recommandé : créer une **organisation** pour le projet :
1. Compte personnel d'abord
2. Settings → Organizations → New organization
3. Nom : `wkey-app` (ou similaire)
4. Plan : Free

## Étape 1.2 — Créer le dépôt

1. Sur GitHub → **New repository**
2. Owner : `wkey-app` (ton organisation)
3. Repository name : `wkey-blockchain`
4. Description : `WINTG Layer 1 blockchain — fast, low-fee, EVM-compatible — for the African market`
5. **Public** (recommandé pour transparence)
6. ⚠️ **Ne pas** cocher "Initialize this repository with a README" (on a déjà tout)
7. Cliquer **Create repository**

GitHub va t'afficher des commandes. Ignore et utilise les commandes ci-dessous.

## Étape 1.3 — Pousser le code

Depuis le dossier `C:\wintg-blockchain` :

```bash
# Le repo est déjà initialisé localement
git remote add origin https://github.com/wkey-app/wkey-blockchain.git
git push -u origin main
```

Si GitHub demande un mot de passe, utilise un **Personal Access Token** :
- GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
- Generate new token (classic), scope `repo`
- Copier le token (commence par `ghp_...`)
- L'utiliser comme mot de passe quand git le demande

## Étape 1.4 — Activer GitHub Actions

Le code contient déjà 3 workflows dans `.github/workflows/` :
- `ci.yml` — tests + coverage à chaque push
- `codeql.yml` — analyse sécurité hebdomadaire
- `release.yml` — auto-changelog quand tu push un tag `v1.0.0`

Va sur **Actions** dans GitHub → "I understand my workflows, go ahead and enable them".

Le premier `ci.yml` va tourner automatiquement. Devrait passer ✅ (217 tests, 95% coverage).

---

# PHASE 2 — Infrastructure (2-4 heures)

## Étape 2.1 — Acheter un serveur cloud

**Recommandation : Hetzner Cloud (Allemagne)** — meilleur rapport qualité/prix pour notre cas.

→ [https://console.hetzner.cloud/](https://console.hetzner.cloud/)

Specs minimum pour le validateur principal :
| Ressource | Valeur |
|---|---|
| CPU | 8 vCPU AMD/Intel |
| RAM | 16 GB |
| Disque | 240 GB SSD NVMe |
| Bande passante | 20 TB/mois |
| OS | **Ubuntu 22.04 LTS** |
| Plan Hetzner | **CCX23** = ~50 €/mois HT |

Alternatives :
- **OVH VPS Game** (France) : ~40 €/mois — bonne latence Afrique
- **AWS t3.large** (Paris) : ~60 €/mois — plus cher mais haute dispo
- **DigitalOcean** : ~50 €/mois

Lors de la création :
1. Image : **Ubuntu 22.04**
2. SSH key : ajouter ta clé publique (sinon password)
3. Datacenter : **Frankfurt** (latence ~150 ms vers Lomé) ou **Paris**
4. Nom : `wkey-validator-01`

Une fois créé, note l'**IP publique** (ex: `49.13.156.45`).

## Étape 2.2 — Configurer DNS chez ton registrar wkey.app

Il faut pointer plusieurs sous-domaines vers l'IP du serveur. Dans ton panneau DNS (Namecheap, Gandi, Cloudflare, etc.), ajoute ces enregistrements `A` :

| Sous-domaine | Type | Valeur (IP serveur) | TTL |
|---|---|---|---|
| `chain` | A | `49.13.156.45` | 300 |
| `ws` | A | `49.13.156.45` | 300 |
| `explorer` | A | `49.13.156.45` | 300 |
| `testnet-rpc` | A | `49.13.156.45` | 300 |
| `testnet-ws` | A | `49.13.156.45` | 300 |
| `testnet-explorer` | A | `49.13.156.45` | 300 |
| `faucet` | A | `49.13.156.45` | 300 |
| `docs` | CNAME | `wkey-app.github.io` | 300 |

> 💡 Pour la production, met les services derrière **Cloudflare** :
> 1. Crée un compte sur [cloudflare.com](https://cloudflare.com)
> 2. Add Site → `wkey.app` → Free plan
> 3. Cloudflare te donne 2 nameservers (ex: `daisy.ns.cloudflare.com`)
> 4. Chez ton registrar, change les nameservers vers ceux de Cloudflare
> 5. Dans Cloudflare DNS, ajoute les enregistrements ci-dessus avec proxy activé (orange cloud)

Avantages Cloudflare :
- Protection DDoS gratuite
- TLS/SSL automatique
- Cache + CDN
- WAF

⚠️ Pour le RPC blockchain, **désactive le proxy Cloudflare** (orange cloud → grey) car certains clients RPC ont des soucis avec.

## Étape 2.3 — SSH sur le serveur

```bash
ssh root@49.13.156.45
# (mot de passe ou clé SSH)
```

Première fois, mets à jour le système :

```bash
apt update && apt upgrade -y
apt install -y git curl
```

## Étape 2.4 — Cloner le repo et lancer le setup

```bash
cd /opt
git clone https://github.com/wkey-app/wkey-blockchain.git wintg
cd wintg
chmod +x scripts/*.sh
```

### A. Générer les wallets sécurisés (offline si possible)

⚠️ **À FAIRE SUR TON PC LOCAL, PAS LE SERVEUR** (pour ne jamais exposer la passphrase).

```bash
# Sur ton PC :
cd contracts
npx ts-node scripts/generate-wallets.ts
# Demande une passphrase >= 16 caractères
# → wallets.encrypted.json créé
```

Tu obtiens 11 wallets :
- `deployer` — déploie les contrats
- `validator-primary` — clé du validateur (CRITIQUE)
- `validator-standby` — clé du standby
- 3× `treasury-signer` — multisig Trésorerie
- 4× `*-beneficiary` — Team / Advisors / Ecosystem / Partners
- `validator-pool` — reçoit les 20% des fees

**Sauvegarde `wallets.encrypted.json` dans 3 endroits différents** (cloud chiffré + clé USB + pas de copie en clair).

### B. Régénérer le genesis avec les vraies adresses

```bash
# Toujours sur ton PC local
cd contracts
cp ../.env.example ../.env

# Édite .env :
#   DEPLOYER_ADDRESS=<adresse deployer>
#   VALIDATORS=<adresse validator-primary>
#   LIQUIDITY_MULTISIG_ADDRESS=<adresse multisig>

npm run generate-genesis -- --network mainnet
# → besu/genesis.json mis à jour
```

Push ce changement vers GitHub :
```bash
git add besu/genesis.json
git commit -m "chore: genesis with mainnet addresses"
git push
```

### C. Lancer le validateur sur le serveur

Sur le serveur :

```bash
cd /opt/wintg
git pull
sudo ./scripts/setup-validator.sh mainnet
```

Le script :
1. Installe Java 21 + Hyperledger Besu 26.4.0
2. Crée l'utilisateur `besu` avec accès limité
3. Copie les configs dans `/etc/besu/`
4. Configure UFW (firewall) + fail2ban
5. Crée le service systemd `besu.service`
6. Génère ou importe la clé validateur (que tu uploades manuellement)
7. Démarre Besu

⚠️ Lors de la première exécution, le script demandera la **clé privée du validateur**. Tu peux soit :
- La uploader temporairement (la supprimer ensuite)
- L'importer depuis `wallets.encrypted.json` :
  ```bash
  scp wallets.encrypted.json root@49.13.156.45:/tmp/
  ssh root@49.13.156.45
  npx ts-node /tmp/decrypt-wallet.ts validator-primary > /etc/besu/keys/key.tmp
  # Le wrapper systemd chiffrera ensuite
  ```

### D. Vérifier que Besu produit des blocs

```bash
# Sur le serveur
sudo systemctl status besu
sudo journalctl -u besu -f

# Test RPC
curl -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
  http://localhost:8545
# → doit retourner un bloc, et incrémenter toutes les 3 secondes
```

### E. Configurer Nginx + TLS Let's Encrypt

```bash
sudo ./scripts/setup-rpc.sh mainnet
sudo certbot --nginx -d chain.wkey.app -d ws.wkey.app \
  --non-interactive --agree-tos -m admin@wkey.app
```

À ce stade, **`https://chain.wkey.app`** doit répondre.

### F. Déployer les smart contracts

Depuis ton PC local :

```bash
cd contracts
npm run deploy:mainnet
```

Le script déploie les 20 contrats à leurs adresses CREATE pré-allouées dans le genesis. Vérifie :

```bash
cat deployments/wintgMainnet.json
```

### G. Lancer Blockscout (block explorer)

Sur le serveur :

```bash
cd /opt/wintg/explorer
cp .env.example .env
# Éditer .env avec WINTG_RPC_URL=https://chain.wkey.app
docker compose up -d
```

Attendre ~5 min pour l'indexation initiale, puis vérifier `https://explorer.wkey.app`.

## Étape 2.5 — Stack monitoring

Optionnel mais recommandé pour la production :

```bash
cd /opt/wintg/monitoring
cp .env.example .env
# Éditer .env (mot de passe Grafana, token Telegram)
docker compose up -d
```

Grafana sur `http://serveur-IP:3000` (admin / cf .env). Dashboard `WINTG — Besu Overview` déjà inclus.

---

# PHASE 3 — Testnet, Audit, Mainnet (1-2 semaines)

## Étape 3.1 — Lancer le testnet public

**Avant la mainnet**, lance le testnet pour que les devs puissent tester :

1. Achète un 2ème serveur (CCX13 suffit ~25 €/mois)
2. Sur ce serveur, fais :
   ```bash
   sudo ./scripts/setup-validator.sh testnet
   ```
3. Configure DNS pour `testnet-rpc.wkey.app` etc.
4. Déploie les contrats sur testnet :
   ```bash
   npm run deploy:testnet
   ```
5. Lance le faucet :
   ```bash
   cd faucet
   docker compose up -d
   ```

## Étape 3.2 — Audit externe (TRÈS recommandé)

Avant de mettre 1 milliard de WTG en circulation, fais auditer le code par un cabinet sérieux :

| Cabinet | Réputation | Prix indicatif | Délai |
|---|---|---:|---|
| **OpenZeppelin** | Top tier | $80k-150k | 6-8 semaines |
| **CertiK** | Très connu | $30k-80k | 4-6 semaines |
| **Hacken** | Bon | $20k-50k | 3-5 semaines |
| **PeckShield** | Bon | $25k-60k | 4-6 semaines |
| **Code4rena** | Crowdsourced | $30k-100k | 1-2 semaines |

Demande des devis. Code4rena est plus rapide et moins cher mais moins thorough qu'un audit traditionnel.

**Bug bounty** post-audit sur [Immunefi](https://immunefi.com) : réserve 50k-200k USD, paie seulement si bugs trouvés.

## Étape 3.3 — Préparer le TGE (Token Generation Event)

1. Définir la date du TGE (au moins 30 jours après la fin de l'audit)
2. Régénérer le genesis avec les **vraies adresses** des bénéficiaires
3. Préparer la communication :
   - Site web `wkey.app` (à construire après)
   - Tweet d'annonce
   - Discord / Telegram communautaire
4. Soumettre WINTG à [chainlist.org](https://github.com/ethereum-lists/chains) (PR avec les fichiers `chainlist/*.json`)
5. Soumettre à Coingecko / CoinMarketCap (post-TGE)

## Étape 3.4 — Lancer la mainnet

Le jour J :

1. Vérifier 1 dernière fois l'audit + génésis
2. Démarrer le validateur principal + standby
3. Déployer les contrats (`npm run deploy:mainnet`)
4. Vérifier les sources sur Blockscout
5. Annoncer publiquement
6. Distribuer les tranches Liquidity (DEX, CEX si listing)
7. Définir les allocations Public/Private Sale via le multisig Treasury
8. Publier le Merkle root Airdrop

---

# 📞 Aide et urgence

## Si quelque chose ne marche pas

1. **Vérifier les logs** : `sudo journalctl -u besu -f`
2. **Health check** : `./scripts/health-check.sh`
3. **Redémarrer** : `sudo systemctl restart besu`
4. **Forum Hyperledger Besu** : [https://chat.hyperledger.org/channel/besu](https://chat.hyperledger.org/channel/besu)

## Procédures d'urgence (déjà documentées)

- **Validateur down** : `./scripts/promote-standby.sh` (sur standby)
- **Drain Treasury** : pause multisig + révoquer signataires
- **Bug critique smart contract** : appeler `pause()` via multisig
- **Compromission clé** : voir `docs/SECURITY.md`

## Contacts utiles

- Hetzner support : [https://www.hetzner.com/support](https://www.hetzner.com/support)
- Cloudflare support : 24/7 sur dashboard
- Let's Encrypt forum : [community.letsencrypt.org](https://community.letsencrypt.org)

---

# ✅ Checklist finale avant TGE

```
PHASE 1 — Code public
[ ] Repo GitHub créé et public
[ ] Code pushé
[ ] CI verte (tests + coverage)
[ ] Documentation accessible

PHASE 2 — Infrastructure
[ ] Serveur validateur principal commandé
[ ] Serveur hot standby commandé
[ ] Serveur RPC public commandé
[ ] DNS configuré sur wkey.app
[ ] Cloudflare configuré (optionnel)
[ ] Setup-validator.sh exécuté avec succès
[ ] Setup-standby.sh exécuté avec succès
[ ] Setup-rpc.sh exécuté avec succès
[ ] HTTPS opérationnel sur chain.wkey.app
[ ] Blockscout indexant
[ ] Monitoring + alertes Telegram fonctionnels

PHASE 3 — Production-ready
[ ] Testnet public ouvert >= 30 jours
[ ] Faucet testnet opérationnel
[ ] Audit externe réalisé
[ ] Toutes les vulnérabilités CRITIQUES/HIGH corrigées
[ ] Bug bounty actif (réserve >= $50k)
[ ] Wallets de production générés et sauvegardés (3 lieux)
[ ] Multisig Treasury 2-of-3 configuré
[ ] Genesis final avec vraies adresses
[ ] Site web wkey.app prêt
[ ] Communication crise préparée
[ ] WINTG soumis à chainlist.org

PHASE 4 — Lancement (jour J)
[ ] Smart contracts déployés sur mainnet
[ ] Sources vérifiées sur Blockscout
[ ] Allocations Public/Private Sale finalisées
[ ] Merkle root Airdrop publié
[ ] Liquidity DEX disponible
[ ] Annonce publique faite
```

---

> Tout ce qui est dans `scripts/` et `contracts/` est prêt. Le reste est
> opérationnel : louer serveur, configurer DNS, suivre ce guide.
> Si tu suis chaque étape, en **2-4 heures** ta blockchain peut être online sur testnet.
