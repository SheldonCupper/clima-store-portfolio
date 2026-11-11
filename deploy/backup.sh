#!/usr/bin/env bash
set -euo pipefail
umask 077

# Execute como root. Não remove backups antigos nem altera o banco.
exec 9>/run/clima-store-backup.lock
flock -n 9 || exit 0
backup_dir=/var/backups/clima-store
install -d -m 700 "$backup_dir"
stamp=$(date -u +%Y%m%dT%H%M%SZ)

runuser -u postgres -- /usr/lib/postgresql/17/bin/pg_dump \
  --format=custom --no-owner --no-acl --dbname=clima_store \
  > "$backup_dir/database-$stamp.dump.partial"
mv "$backup_dir/database-$stamp.dump.partial" "$backup_dir/database-$stamp.dump"
tar -czf "$backup_dir/uploads-$stamp.tar.gz.partial" \
  -C /var/lib/clima-store/uploads .
mv "$backup_dir/uploads-$stamp.tar.gz.partial" "$backup_dir/uploads-$stamp.tar.gz"
