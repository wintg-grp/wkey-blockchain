# Configuration DNS pour wkey.app

Tous les sous-domaines à configurer chez ton registrar (ou Cloudflare) avec
les bons enregistrements pour que la blockchain WINTG soit accessible.

## Hypothèse

Tu as un serveur cloud (Hetzner / OVH / AWS) avec une IP publique fixe.
Disons : **`49.13.156.45`** pour le validateur principal et **`49.13.156.46`** pour le nœud RPC public.

Si tu mets tout sur le même serveur, utilise la même IP partout.

## Mainnet (Chain ID 2280)

| Sous-domaine | Type | Valeur | Rôle | TTL |
|---|---|---|---|---:|
| `chain.wkey.app` | A | `49.13.156.46` | RPC HTTPS mainnet | 300 |
| `ws.wkey.app` | A | `49.13.156.46` | WebSocket mainnet | 300 |
| `explorer.wkey.app` | A | `49.13.156.46` | Block Explorer mainnet | 300 |

## Testnet (Chain ID 22800)

| Sous-domaine | Type | Valeur | Rôle | TTL |
|---|---|---|---|---:|
| `testnet-rpc.wkey.app` | A | `49.13.156.47` | RPC HTTPS testnet | 300 |
| `testnet-ws.wkey.app` | A | `49.13.156.47` | WebSocket testnet | 300 |
| `testnet-explorer.wkey.app` | A | `49.13.156.47` | Block Explorer testnet | 300 |
| `faucet.wkey.app` | A | `49.13.156.47` | Faucet testnet | 300 |

## Site web et docs

| Sous-domaine | Type | Valeur | Rôle | TTL |
|---|---|---|---|---:|
| `wkey.app` | A | `<IP serveur web>` | Site wallet (à venir) | 300 |
| `www.wkey.app` | CNAME | `wkey.app` | Redirect www | 300 |
| `docs.wkey.app` | CNAME | `wkey-app.github.io` | Doc statique GitHub Pages | 3600 |
| `status.wkey.app` | CNAME | `cname.statuspage.io` | Status page (optionnel) | 3600 |

## Email (recommandé)

Pour pouvoir envoyer/recevoir des emails `*@wkey.app` (ex: `admin@wkey.app`,
`security@wkey.app`) :

```
Type    Hôte    Valeur                          TTL
MX      @       10 inbound.wkey.app             3600
A       inbound 49.13.156.45                    3600
TXT     @       "v=spf1 a mx ~all"              3600
TXT     _dmarc  "v=DMARC1; p=quarantine; rua=mailto:postmaster@wkey.app"  3600
```

Plus simple : **utilise un service mail managed** (Google Workspace ~6€/utilisateur/mois, Zoho ~1€).

## Sécurité — DNSSEC

Active **DNSSEC** chez ton registrar pour empêcher les attaques DNS spoofing.
Procédure dépend du registrar :
- **Namecheap** : Domain List → Manage → Advanced DNS → DNSSEC ON
- **Gandi** : Activer DNSSEC depuis le panneau du domaine
- **Cloudflare** : Auto si tu utilises leurs nameservers

## Configuration Cloudflare (recommandé pour DDoS protection)

1. Crée un compte sur [cloudflare.com](https://cloudflare.com) — Free plan suffit
2. **Add Site** → `wkey.app`
3. Cloudflare scanne tes DNS existants
4. Cloudflare te donne **2 nameservers**, ex :
   - `daisy.ns.cloudflare.com`
   - `colt.ns.cloudflare.com`
5. Chez ton registrar (où tu as acheté wkey.app), change les nameservers vers ceux de Cloudflare
6. Attendre 1-24h pour la propagation
7. Dans Cloudflare DNS, ajoute les enregistrements ci-dessus

### Configuration recommandée par sous-domaine

| Sous-domaine | Mode Cloudflare |
|---|---|
| `chain.wkey.app` | **Grey cloud (DNS only)** ⚠️ Cloudflare proxy bloque parfois les RPC |
| `ws.wkey.app` | **Grey cloud (DNS only)** WebSocket nécessite TCP direct |
| `explorer.wkey.app` | Orange cloud (proxied) — protection DDoS |
| `testnet-*` | Orange cloud (proxied) |
| `faucet.wkey.app` | Orange cloud (proxied) — rate limit anti-spam |
| `wkey.app` | Orange cloud (proxied) |
| `docs.wkey.app` | Orange cloud (proxied) |

### Règles WAF Cloudflare (optionnel mais conseillé pour faucet)

Sur `faucet.wkey.app`, ajoute :
- Rate limit : 10 req / minute / IP
- Bot fight mode : ON
- Country filter : seulement les pays cibles (Togo, Bénin, CIV, Sénégal…)

## Vérifier la propagation DNS

```bash
# Linux / Mac
dig chain.wkey.app
dig +short chain.wkey.app

# Windows
nslookup chain.wkey.app

# En ligne
https://www.whatsmydns.net/#A/chain.wkey.app
```

Attendre 5-30 min après config, jusqu'à 24h max pour propagation globale.

## Tester que tout marche

Une fois DNS propagé et serveur configuré :

```bash
# RPC répond
curl -X POST https://chain.wkey.app \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}'
# Attendu : {"jsonrpc":"2.0","id":1,"result":"0x8e8"}  (0x8e8 = 2280)

# Explorer accessible
curl -I https://explorer.wkey.app
# Attendu : HTTP/2 200

# WebSocket
wscat -c wss://ws.wkey.app
# (s'abonner aux nouveaux blocs)
```

## Récapitulatif : commandes DNS shell-friendly

Si ton registrar a une API (ex: Cloudflare API), tu peux scripter :

```bash
# Cloudflare — créer un A record
ZONE_ID="<ton zone id>"
TOKEN="<ton api token>"

curl -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "A",
    "name": "chain",
    "content": "49.13.156.46",
    "ttl": 300,
    "proxied": false
  }'
```

Voir [Cloudflare API docs](https://developers.cloudflare.com/api/operations/dns-records-for-a-zone-create-dns-record).
