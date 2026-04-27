# WINTG Testnet Faucet

API + UI minimaliste pour distribuer 100 WTG / 24 h aux développeurs sur le testnet.

## Démarrage local

```bash
cd faucet
npm install
cp .env.example .env
# Remplir : FAUCET_PRIVATE_KEY (wallet pré-funded depuis Ecosystem multisig)
#           HCAPTCHA_SECRET    (récupérer sur dashboard.hcaptcha.com)

npm run dev
# → http://localhost:3030
```

## Production

```bash
docker build -t wintg-faucet .
docker run -d -p 3030:3030 --env-file .env --name wintg-faucet wintg-faucet
```

Reverse proxy Nginx + TLS Let's Encrypt à mettre devant. Déploiement type sur `faucet.wintg.network`.

## API

### `POST /api/drip`

Body :
```json
{ "address": "0x...", "captcha": "<hcaptcha-token>" }
```

Réponses :
- `200` : `{ ok: true, txHash, amountWTG, explorer }`
- `400` : adresse / captcha invalide
- `403` : captcha rejeté
- `429` : cooldown actif (par adresse ou par IP)
- `503` : faucet drainé

### `GET /api/health`

Status du faucet (solde, dernier bloc, stats).

## Sécurité

- ✅ hCaptcha (anti-bot)
- ✅ Rate limit 10 req/h/IP via `express-rate-limit`
- ✅ Cooldown 24 h par adresse + par IP
- ✅ HTTP security headers (`helmet`)
- ✅ CORS restrictif (`ALLOWED_ORIGINS`)
- ✅ Wallet faucet **séparé** des wallets de production
- ⚠️ Tracking en mémoire — pour production multi-instance, basculer sur Redis
