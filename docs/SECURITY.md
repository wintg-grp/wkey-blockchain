# Sécurité — WINTG

## Modèle de menace

| Attaquant | Capacités | Risque |
|---|---|---|
| Script kiddie (DDoS, scan) | Volume, pas de zero-day | Faible — Cloudflare + UFW |
| Cybercriminel ciblé | Exploits 1-day, phishing, social engineering | Moyen — défense en profondeur |
| Nation-state | Zero-days, supply chain, pression légale | Élevé — limitation par décentralisation progressive |
| Insider (équipe / validateur) | Accès admin, clés | Élevé — multisig + rotation + audit logs |

## Sécurité — Smart contracts

### Contrôles préventifs

- ✅ Solidity `0.8.24` (overflow checks par défaut)
- ✅ OpenZeppelin v5 : `Ownable2Step`, `ReentrancyGuard`, `Pausable`, `MerkleProof`, `ERC20Permit`
- ✅ Variables critiques **immuables** (allocations, BPS, schedules)
- ✅ Fonctions sensibles : `nonReentrant` + `whenNotPaused`
- ✅ Custom errors (gas-efficient, pas de string)
- ✅ NatSpec sur 100 % des fonctions publiques
- ✅ Tests : 68 cas, ≥ 95 % coverage lines
- ✅ Tests fuzz prévus (Echidna, à intégrer en CI)

### Contrôles détectifs

- ✅ Events bien structurés (traçabilité on-chain : `TokensReleased`, `Distributed`, `Burned`, `Submitted`/`Confirmed`/`Executed`...)
- ✅ Cumuls publics (`released`, `totalBurned`, `cumulativeDistributed`)

### Contrôles correctifs

- ✅ `Pausable` sur tous les contrats critiques (`VestingVault`, `AirdropVesting`, `SaleVestingBase`, `StakingRewardsReserve`, `WTGToken`)
- ✅ Multisig 2-of-3 (extensible 3-of-5) sur la Trésorerie
- ✅ Timelock optionnel par transaction multisig
- ✅ Rate limit on-chain sur `StakingRewardsReserve` (1 %/jour)

### Audit externe — pré-mainnet

Recommandation forte :

| Outil/firme | Type | Statut |
|---|---|---|
| Slither | Statique (à intégrer en CI) | ⚠️ TODO |
| Mythril | Symbolique | ⚠️ TODO |
| Echidna | Fuzz 24h | ⚠️ TODO |
| Audit externe (CertiK / Hacken / OpenZeppelin) | Manuel | ⚠️ Recommandé avant TGE mainnet |
| Bug bounty public | Continu | ⚠️ Lancer post-mainnet, réserve ≥ 10k USD |

## Sécurité — Validateur

### Clé privée

- 🔐 **Chiffrement AES-256** au repos
- 🔐 Stockage dans **HashiCorp Vault** ou **AWS KMS / GCP KMS** (recommandé)
- 🔐 Backup chiffré horaire dans **3 emplacements géographiquement distincts**
  (cloud + local + offsite physique chiffré)
- 🔐 Procédure de **restauration testée mensuellement**
- 🔐 **Rotation de la clé** tous les 6 mois (ou immédiate sur suspicion)
- 🔐 Jamais d'export en clair, jamais de copie sur poste de travail

### Système

- 🛡️ **UFW** : seuls 22 (SSH), 30303 (P2P) ouverts
- 🛡️ **Fail2ban** sur SSH (et sur Nginx pour les nœuds RPC)
- 🛡️ **SSH par clé uniquement** (PasswordAuthentication=no, PermitRootLogin=no)
- 🛡️ **Mise à jour OS automatique** (`unattended-upgrades` pour les CVE de sécurité)
- 🛡️ **Logs centralisés** via Loki (chiffrés en transit)
- 🛡️ **Monitoring 24/7** Prometheus + Grafana + alertes Telegram (latence bloc, sync, peers, disque, RAM)

### Réseau

- 🌐 **RPC public derrière Cloudflare** (DDoS, WAF, rate limit edge)
- 🌐 **Nginx** : rate limit applicatif `30 r/s` par IP (`burst=60 nodelay`)
- 🌐 **Pas de RPC sur le validateur** (loopback uniquement)
- 🌐 **TLS 1.2 / 1.3** uniquement, certificats Let's Encrypt auto-renew
- 🌐 **HSTS preload** + headers de sécurité (`X-Frame-Options DENY`, `X-Content-Type-Options nosniff`)

## Sécurité — Treasury & multisig

### Configuration phase 1

- **Multisig 2-of-3** : 3 signataires, 2 confirmations requises
- Signataires recommandés :
  1. CEO WINTG (clé Ledger hardware)
  2. CTO WINTG (clé Ledger hardware)
  3. Conseil juridique externe (notaire/avocat, clé Ledger sous séquestre)

### Configuration phase 2+

- **Multisig 3-of-5** ou **3-of-7** avec ouverture progressive (DAO partenaires UEMOA)
- Timelock 48h sur transactions > 1 M WTG
- Timelock 7j sur changement de signataires

### Bonnes pratiques

- ✅ Hardware wallets obligatoires pour les signataires
- ✅ Aucune clé privée multisig en clair sur disque
- ✅ Réunion physique (ou visio Zoom + signature audio) pour transactions > 5 M WTG
- ✅ Diversité géographique des signataires (anti-coercition)

## Procédures d'incident

### Incident : compromission soupçonnée d'une clé validateur

**Délai cible : < 1 heure**

1. Couper l'accès réseau au validateur compromis (`ufw default deny`)
2. Notifier le canal Telegram validators
3. Vote IBFT pour retirer le validateur compromis
4. Si standby disponible : promotion (`./scripts/promote-standby.sh`)
5. Génération nouvelle clé + audit forensique de la compromise
6. Vote IBFT pour réinclure (avec nouvelle clé)
7. Post-mortem dans les 7 jours

### Incident : DDoS sur RPC public

**Délai cible : < 15 minutes**

1. Activer Cloudflare "Under Attack Mode"
2. Resserrer rate limit Nginx (`30 r/s` → `5 r/s`)
3. Si nécessaire : blacklist IP ranges au niveau Cloudflare WAF
4. Vérifier que les autres nœuds RPC absorbent le trafic légitime

### Incident : bug critique smart contract

**Délai cible : < 30 minutes**

1. Multisig appelle `pause()` sur le contrat concerné
2. Investigation par équipe technique
3. Si fix simple : déploiement nouveau contrat + migration des balances (via multisig)
4. Si non : pause maintenue jusqu'à audit externe + correction
5. Communication transparente à la communauté

### Incident : drain Treasury

**Délai cible : immédiat**

1. Pause de tous les contrats Treasury / FeeDistributor
2. Retirer les signataires compromis (vote multisig si quorum atteignable)
3. Audit forensique
4. Communication crise (Twitter / Discord)
5. Si fonds non récupérables : compensation depuis Ecosystem grants

## Plan de continuité

### Sauvegardes

| Quoi | Fréquence | Cible | Chiffrement |
|---|---|---|---|
| Clés validateurs | Horaire | 3 emplacements distincts | AES-256-GCM |
| Data Besu (`/var/lib/besu/data`) | Quotidienne (snapshot LVM) | NAS + cloud | AES-256 |
| DB Blockscout | Quotidienne (`pg_dump`) | NAS + cloud | AES-256 |
| Code source repo | Push immédiat | GitHub + miroir GitLab | — |
| Documentation | Push immédiat | Git + Notion | — |

### Recovery Time Objectives (RTO)

| Service | RTO | RPO |
|---|---|---|
| Validateur | < 1 h (via standby) | 0 (state préservé par P2P) |
| RPC public | < 15 min (multi-instances) | 0 |
| Block explorer | < 4 h (re-indexation possible) | 0 (la chaîne est canonique) |
| Monitoring | < 1 h | 1 h (perte logs scrape) |

## Reporting de vulnérabilités

📧 `security@wintg.group` (PGP key sur [keybase.io/wkey](https://keybase.io/wkey))

⚠️ **Ne pas ouvrir d'issue publique sur GitHub.**

Bug bounty actif post-mainnet. Niveaux de récompense :
- Critique (drain, takeover) : 5 000 – 25 000 USD en WTG
- High (déni de service, perte partielle) : 1 000 – 5 000 USD
- Medium (escalade, info disclosure) : 200 – 1 000 USD
- Low : merch + reconnaissance

Disclosure responsable obligatoire (90 jours).
