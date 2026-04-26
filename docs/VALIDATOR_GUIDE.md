# Guide Validateur WINTG

## Pour qui ?

Toute personne ou organisation invitée à rejoindre le set des validateurs WINTG (UCAO, banques UEMOA, partenaires institutionnels, validateurs DAO).

## Pré-requis

### Hardware

| Ressource | Minimum | Recommandé |
|---|---|---|
| vCPU | 4 | 8 |
| RAM | 8 GB | 16 GB |
| Disque | 200 GB SSD | 500 GB NVMe |
| Réseau | 100 Mbps | 1 Gbps |
| Uptime | ≥ 99 % | ≥ 99.9 % |

### OS et logiciel

- Ubuntu 22.04 LTS (ou 24.04)
- OpenJDK 21
- Hyperledger Besu ≥ 26.4.0
- ufw, fail2ban, openssh-server

### Réseau

- IP publique dédiée
- Ports ouverts : `22/tcp` (SSH par clé), `30303/tcp+udp` (P2P Besu)
- **Aucun port RPC public** (les requêtes utilisateurs vont sur les nœuds RPC dédiés, pas sur les validateurs)

## Procédure d'onboarding

### 1. Provisionner le serveur et installer Besu

```bash
ssh root@validator-XX.example.com
git clone https://github.com/wintg/wintg-blockchain.git /opt/wintg
cd /opt/wintg
sudo ./scripts/setup-validator.sh mainnet
```

À la fin du script, ton **adresse de validateur** est affichée :

```
✓ Clé validateur générée. Adresse : 0xABCDEF...123456
```

**📌 Communique cette adresse à l'équipe WINTG** par canal sécurisé (PGP).

### 2. Configurer la clé en sécurité

```bash
# La clé est dans /etc/besu/keys/key (chiffrée AES-256 via le wrapper systemd)
# Backup IMMÉDIAT :
sudo /opt/wintg/scripts/backup-keys.sh
# → /var/backups/besu/besu-keys-<timestamp>.tar.gz.enc
# → Copier dans 3 emplacements géographiques distincts
```

Recommandation forte : intégrer un sidecar **HashiCorp Vault** ou **AWS KMS / GCP KMS** pour le déchiffrement à la volée au lieu de la passphrase shell.

### 3. Synchronisation initiale

```bash
sudo systemctl status besu
sudo journalctl -u besu -f
./scripts/health-check.sh
```

Sync attendue : quelques minutes à quelques heures selon la taille de la chaîne.

### 4. Demande d'inclusion (vote IBFT)

À ce stade, tu es un **full node**, pas encore un validateur.

L'équipe WINTG (ou un validateur existant) lance un vote pour t'inclure :

```bash
# Sur un validateur existant :
./scripts/add-validator.sh 0xVOTRE_ADRESSE
```

Le vote se propage. Quand la majorité (> N/2) des validateurs courants a voté, tu es **promu validateur** automatiquement au prochain epoch (≤ 30 000 blocs).

### 5. Vérification du rôle

```bash
curl -s -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"ibft_getValidatorsByBlockNumber","params":["latest"],"id":1}' \
  http://127.0.0.1:8545 | jq
```

Tu dois apparaître dans la liste retournée.

À partir de là, ton nœud commence à proposer et signer des blocs en rotation.

## Obligations opérationnelles

### Disponibilité

- ≥ 99 % uptime mensuel
- Délai de réaction sur incidents critiques : < 1h (équipe d'astreinte)
- Notification WINTG en cas de maintenance planifiée

### Monitoring

- Métriques Prometheus exposées en interne sur `:9545/metrics`
- Logs systemd intacts (`journalctl -u besu`)
- Healthcheck passing : `./scripts/health-check.sh`

### Sécurité

- Clé validateur **jamais** sur disque non chiffré
- SSH par clé uniquement, pas de mot de passe
- Mise à jour de sécurité OS automatique (`unattended-upgrades`)
- Fail2ban actif sur SSH
- Audit logs revus hebdomadairement
- Rotation de la clé tous les 6 mois (ou en cas de suspicion)

### Communication

- Channel Telegram privé "wintg-validators"
- Réunion mensuelle (Zoom)
- Notification 24h avant maintenance
- PGP pour échanges sensibles

## Économie

- Récompense : **20 % des frais** de transaction de la chaîne
- Distribution pro-rata des blocs validés (mesurée on-chain)
- Pas d'inflation pré-staking phase 2
- Aucun staking requis en phase 1 (consortium PoA)

## Procédure de retrait

Pour quitter le set des validateurs :

1. Notifier l'équipe WINTG 30 jours à l'avance
2. Un vote IBFT est lancé pour te retirer (`add-validator.sh ... false`)
3. Une fois retiré, ton nœud reste full node ou peut être éteint
4. Backup final + audit de sécurité avant arrêt

## Slashing & sanctions

IBFT 2.0 ne supporte pas le slashing automatique. La gouvernance WINTG peut :

- **Avertissement** : disponibilité < 95 % pendant 1 mois
- **Suspension temporaire** : non-conformité opérationnelle (ex. ports RPC ouverts publiquement)
- **Retrait définitif** : faute grave (compromission, comportement byzantin avéré, conflit d'intérêts non déclaré)

Décision via vote des validateurs restants (quorum > 2/3).

## Procédure d'urgence : panne validateur

Si ton nœud crashe :

1. **Si tu as un hot standby** :
   ```bash
   ssh root@standby
   sudo /opt/wintg/scripts/promote-standby.sh
   ```
2. **Sinon, restaure depuis backup** :
   ```bash
   sudo systemctl stop besu
   # Restaurer /etc/besu/keys/ depuis backup chiffré
   sudo systemctl start besu
   ```
3. **Notifier immédiatement** le canal Telegram validators

## FAQ

**Q : Combien gagne un validateur ?**
R : Variable selon le volume de transactions. À T0 (faible volume) : ~0 WTG/jour. À 100k tx/jour avec fee moyen 0.001 WTG → 20 WTG/jour pour le pool, divisé par N validateurs. Le revenu sérieux arrive avec l'adoption (paiements, remittances).

**Q : Puis-je faire tourner d'autres services sur le même serveur ?**
R : Non recommandé. Le validateur doit avoir des ressources dédiées et un profil de sécurité strict. Co-location avec un explorer ou monitoring est tolérée mais non encouragée.

**Q : Que se passe-t-il si plusieurs validateurs tombent en même temps ?**
R : Si > N/3 sont down, la chaîne s'arrête (pas de finalité). Procédure d'urgence : redémarrer manuellement les validateurs, ou (cas extrême) régénérer le genesis.

**Q : Le hot standby a-t-il besoin de sa propre clé validateur ?**
R : Oui, idéalement. Soit le standby a une clé séparée dans la liste des validateurs (recommandé phase 2+), soit il utilise la même clé que le primaire (phase 1 simple, mais ne jamais lancer les deux simultanément).
