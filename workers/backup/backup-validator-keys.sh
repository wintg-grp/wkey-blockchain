#!/usr/bin/env bash
# WINTG Validator Key Backup
# ---------------------------
# Backups encryptés AES-256-CBC de :
#   - /etc/besu/mainnet/keys/key   (validator key mainnet)
#   - /etc/besu/testnet/keys/key   (validator key testnet)
#   - /etc/besu/mainnet/genesis.json
#   - /etc/besu/testnet/genesis.json
#
# Le tarball chiffré est uploadé vers :
#   - /backup/wintg/  (local backup dir on server)
#   - Optionnel : un bucket S3-compatible si rclone configuré
#
# Variables d'environnement attendues :
#   BACKUP_PASSPHRASE   passphrase 32+ chars utilisée pour AES-256
#   BACKUP_DIR          répertoire local de stockage (default /backup/wintg)
#   BACKUP_S3_REMOTE    rclone remote (ex: s3:wintg-backups), optionnel
#
# Cron suggéré (1 fois / jour) :
#   0 3 * * *  /opt/wintg-backup/backup-validator-keys.sh
#
# Restauration :
#   openssl enc -d -aes-256-cbc -pbkdf2 -salt -in backup.tar.gz.enc -out backup.tar.gz
#   tar xzf backup.tar.gz

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/backup/wintg}"
TIMESTAMP=$(date -u +%Y%m%d-%H%M%S)
WORKDIR=$(mktemp -d /tmp/wintg-backup-XXXXXX)
ARCHIVE="wintg-validator-${TIMESTAMP}.tar.gz"
ENCRYPTED="${ARCHIVE}.enc"

cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT

if [[ -z "${BACKUP_PASSPHRASE:-}" ]]; then
  echo "❌ BACKUP_PASSPHRASE env var manquant" >&2
  exit 1
fi
if [[ ${#BACKUP_PASSPHRASE} -lt 16 ]]; then
  echo "❌ BACKUP_PASSPHRASE doit faire ≥ 16 chars" >&2
  exit 1
fi

# 1. Collecter les fichiers
mkdir -p "$BACKUP_DIR"
cd "$WORKDIR"
mkdir -p mainnet testnet

# Validator keys (rwx by besu user only — read as root)
[[ -f /etc/besu/mainnet/keys/key ]] && cp /etc/besu/mainnet/keys/key mainnet/key || echo "⚠️  /etc/besu/mainnet/keys/key absent"
[[ -f /etc/besu/testnet/keys/key ]] && cp /etc/besu/testnet/keys/key testnet/key || echo "⚠️  /etc/besu/testnet/keys/key absent"

# Genesis (publics, mais utiles pour reconstruire)
[[ -f /etc/besu/mainnet/genesis.json ]] && cp /etc/besu/mainnet/genesis.json mainnet/genesis.json || true
[[ -f /etc/besu/testnet/genesis.json ]] && cp /etc/besu/testnet/genesis.json testnet/genesis.json || true

# Configs Besu
[[ -f /etc/besu/mainnet/config.toml ]] && cp /etc/besu/mainnet/config.toml mainnet/config.toml || true
[[ -f /etc/besu/testnet/config.toml ]] && cp /etc/besu/testnet/config.toml testnet/config.toml || true

# Metadata file
cat > metadata.json <<META
{
  "timestamp_utc": "${TIMESTAMP}",
  "hostname": "$(hostname -f)",
  "kernel": "$(uname -r)",
  "files_included": [
    "mainnet/key", "mainnet/genesis.json", "mainnet/config.toml",
    "testnet/key", "testnet/genesis.json", "testnet/config.toml"
  ]
}
META

# 2. Tar
tar czf "$ARCHIVE" mainnet testnet metadata.json

# 3. Encrypt with AES-256-CBC + PBKDF2 (1 million iterations)
openssl enc -aes-256-cbc -pbkdf2 -iter 1000000 -salt \
  -in "$ARCHIVE" -out "$ENCRYPTED" \
  -pass env:BACKUP_PASSPHRASE

# 4. SHA-256 checksum
sha256sum "$ENCRYPTED" > "${ENCRYPTED}.sha256"

# 5. Move to BACKUP_DIR
mv "$ENCRYPTED"        "$BACKUP_DIR/"
mv "${ENCRYPTED}.sha256" "$BACKUP_DIR/"

# 6. Cleanup old backups locally (keep last 14 days)
find "$BACKUP_DIR" -name "wintg-validator-*.tar.gz.enc" -mtime +14 -delete 2>/dev/null || true
find "$BACKUP_DIR" -name "wintg-validator-*.tar.gz.enc.sha256" -mtime +14 -delete 2>/dev/null || true

echo "✓ Backup créé : ${BACKUP_DIR}/${ENCRYPTED}"
echo "   SHA256: $(cat ${BACKUP_DIR}/${ENCRYPTED}.sha256)"

# 7. Optional offsite S3 upload via rclone
if [[ -n "${BACKUP_S3_REMOTE:-}" ]] && command -v rclone >/dev/null; then
  rclone copy "${BACKUP_DIR}/${ENCRYPTED}"        "${BACKUP_S3_REMOTE}/" --progress
  rclone copy "${BACKUP_DIR}/${ENCRYPTED}.sha256" "${BACKUP_S3_REMOTE}/" --progress
  echo "✓ Uploaded to ${BACKUP_S3_REMOTE}"
fi

echo "✓ Backup completed at ${TIMESTAMP} UTC"
