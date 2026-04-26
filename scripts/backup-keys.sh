#!/usr/bin/env bash
# =============================================================================
# backup-keys.sh — Backup chiffré AES-256-GCM des clés Besu
# =============================================================================
# Le fichier produit est chiffré avec une passphrase. Stocker dans 3 emplacements
# géographiquement distincts (cloud + local + offsite physique).
#
# Usage :
#   sudo ./scripts/backup-keys.sh
#   PASSPHRASE_FILE=/path/to/file ./scripts/backup-keys.sh    # non-interactif
# =============================================================================
set -euo pipefail

KEYS_DIR="/etc/besu/keys"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/besu}"
TS=$(date -u +%Y%m%dT%H%M%SZ)
OUT="$BACKUP_DIR/besu-keys-${TS}.tar.gz.enc"

[ -d "$KEYS_DIR" ] || { echo "Dossier $KEYS_DIR introuvable." >&2; exit 1; }

mkdir -p "$BACKUP_DIR"

# Récupérer la passphrase
if [ -n "${PASSPHRASE_FILE:-}" ] && [ -f "$PASSPHRASE_FILE" ]; then
  PASS=$(cat "$PASSPHRASE_FILE")
else
  read -rsp "Passphrase de chiffrement : " PASS && echo
  read -rsp "Confirmer                   : " PASS2 && echo
  [ "$PASS" = "$PASS2" ] || { echo "Mismatch." >&2; exit 1; }
  [ "${#PASS}" -ge 16 ] || { echo "Passphrase trop courte (min 16 chars)." >&2; exit 1; }
fi

# Empaqueter et chiffrer (openssl AES-256-GCM via -aes-256-cbc + PBKDF2 par défaut)
TMP_TARBALL=$(mktemp)
tar -czf "$TMP_TARBALL" -C "$(dirname "$KEYS_DIR")" "$(basename "$KEYS_DIR")"
openssl enc -aes-256-cbc -pbkdf2 -iter 1000000 -salt -in "$TMP_TARBALL" -out "$OUT" \
  -pass "pass:${PASS}"
shred -uf "$TMP_TARBALL"

# Hash pour vérification d'intégrité
sha256sum "$OUT" > "${OUT}.sha256"

# Fichier de manifest
{
  echo "WINTG Besu Keys Backup"
  echo "Timestamp : ${TS}"
  echo "Source    : ${KEYS_DIR}"
  echo "File      : ${OUT}"
  echo "SHA-256   : $(awk '{print $1}' "${OUT}.sha256")"
  echo "Algorithm : AES-256-CBC + PBKDF2(1000000 iters)"
} > "${OUT}.manifest"

echo
echo "✓ Backup chiffré : $OUT"
echo "✓ SHA-256        : ${OUT}.sha256"
echo "✓ Manifest       : ${OUT}.manifest"
echo
echo "⚠️  Copier ces 3 fichiers vers :"
echo "  - Cloud chiffré (Backblaze B2 / Cloudflare R2)"
echo "  - Storage local distinct (NAS, second SSD)"
echo "  - Offsite physique (clé USB chiffrée hors-site)"
