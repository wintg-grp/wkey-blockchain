# Configuration DNS pour wintg.network

Tous les sous-domaines à configurer chez ton registrar (ou Cloudflare) avec
les bons enregistrements pour que la blockchain WINTG soit accessible.

## Hypothèse

Tu as un serveur cloud (Hetzner / OVH / AWS) avec une IP publique fixe.
Disons : **`49.13.156.45`** pour le validateur principal et **`49.13.156.46`** pour le nœud RPC public.

Si tu mets tout sur le même serveur, utilise la même IP partout.

## Mainnet (Chain ID 2280)

| Sous-domaine | Type | Valeur | Rôle | TTL |
|---|---|---|---|---:|
| `rpc.wintg.network` | A | `49.13.156.46` | RPC HTTPS mainnet | 300 |
| `ws.wintg.network` | A | `49.13.156.46` | WebSocket mainnet | 300 |
| `scan.wintg.network` | A | `49.13.156.46` | Block Explorer mainnet | 300 |

## Testnet (Chain ID 22800)

| Sous-domaine | Type | Valeur | Rôle | TTL |
|---|---|---|---|---:|
| `testnet-rpc.wintg.network` | A | `49.13.156.47` | RPC HTTPS testnet | 300 |
| `testnet-ws.wintg.network` | A | `49.13.156.47` | WebSocket testnet | 300 |
| `scan.wintg.network` | A | `49.13.156.47` | Block Explorer testnet | 300 |
| `faucet.wintg.network` | A | `49.13.156.47` | Faucet testnet | 300 |

## Site web et docs

| Sous-domaine | Type | Valeur | Rôle | TTL |
|---|---|---|---|---:|
| `wintg.network` | A | `<IP serveur web>` | Site wallet (à venir) | 300 |
| `www.wintg.network` | CNAME | `wintg.network` | Redirect www | 300 |
| `doc.wintg.network` | CNAME | `wkey-app.github.io` | Doc statique GitHub Pages | 3600 |
| `status.wintg.network` | CNAME | `cname.statuspage.io` | Status page (optionnel) | 3600 |

## Email (recommandé)

Pour pouvoir envoyer/recevoir des emails `*@wintg.group` (ex: `admin@wintg.group`,
`security@wintg.group`) :

```
Type    Hôte    Valeur                          TTL
MX      @       10 inbound.wintg.network             3600
A       inbound 49.13.156.45                    3600
TXT     @       "v=spf1 a mx ~all"              3600
TXT     _dmarc  "v=DMARC1; p=quarantine; rua=mailto:postmaster@wintg.group"  3600
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
2. **Add Site** → `wintg.network`
3. Cloudflare scanne tes DNS existants
4. Cloudflare te donne **2 nameservers**, ex :
   - `daisy.ns.cloudflare.com`
   - `colt.ns.cloudflare.com`
5. Chez ton registrar (où tu as acheté wintg.network), change les nameservers vers ceux de Cloudflare
6. Attendre 1-24h pour la propagation
7. Dans Cloudflare DNS, ajoute les enregistrements ci-dessus

### Configuration recommandée par sous-domaine

| Sous-domaine | Mode Cloudflare |
|---|---|
| `rpc.wintg.network` | **Grey cloud (DNS only)** ⚠️ Cloudflare proxy bloque parfois les RPC |
| `ws.wintg.network` | **Grey cloud (DNS only)** WebSocket nécessite TCP direct |
| `scan.wintg.network` | Orange cloud (proxied) — protection DDoS |
| `testnet-*` | Orange cloud (proxied) |
| `faucet.wintg.network` | Orange cloud (proxied) — rate limit anti-spam |
| `wintg.network` | Orange cloud (proxied) |
| `doc.wintg.network` | Orange cloud (proxied) |

### Règles WAF Cloudflare (optionnel mais conseillé pour faucet)

Sur `faucet.wintg.network`, ajoute :
- Rate limit : 10 req / minute / IP
- Bot fight mode : ON
- Country filter : seulement les pays cibles (Togo, Bénin, CIV, Sénégal…)

## Vérifier la propagation DNS

```bash
# Linux / Mac
dig rpc.wintg.network
dig +short rpc.wintg.network

# Windows
nslookup rpc.wintg.network

# En ligne
https://www.whatsmydns.net/#A/rpc.wintg.network
```

Attendre 5-30 min après config, jusqu'à 24h max pour propagation globale.

## Tester que tout marche

Une fois DNS propagé et serveur configuré :

```bash
# RPC répond
curl -X POST https://rpc.wintg.network \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}'
# Attendu : {"jsonrpc":"2.0","id":1,"result":"0x8e8"}  (0x8e8 = 2280)

# Explorer accessible
curl -I https://scan.wintg.network
# Attendu : HTTP/2 200

# WebSocket
wscat -c wss://ws.wintg.network
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
