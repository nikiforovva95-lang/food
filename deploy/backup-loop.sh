#!/bin/sh
set -eu
umask 077
mkdir -p /backups
while true; do
  name="/backups/foodlab-$(date -u +%Y%m%dT%H%M%SZ).dump"
  if pg_dump --format=custom > "$name.tmp" && pg_restore --list "$name.tmp" >/dev/null; then
    mv "$name.tmp" "$name"
    echo 'A consistent database backup was saved and validated.'
  else
    rm -f "$name.tmp"
    echo 'Backup failed; previous backups were preserved.' >&2
  fi
  sleep "${FOODLAB_BACKUP_SECONDS:-86400}"
done
