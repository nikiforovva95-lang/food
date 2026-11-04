#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
foodlab_runtime="${FOODLAB_RUNTIME:-/workspace/food-runtime}"
backup_name="$foodlab_runtime/backups/foodlab-$(date -u +%Y%m%dT%H%M%SZ).dump"
mkdir -p "$foodlab_runtime/backups"
chmod 700 "$foodlab_runtime/backups"
umask 077
docker --host=unix:///var/run/docker.sock compose --env-file "$foodlab_runtime/.env" -f supabase/selfhost/compose.yml exec -T db pg_dump -U postgres -d postgres --format=custom > "$backup_name"
test -s "$backup_name"
docker --host=unix:///var/run/docker.sock compose --env-file "$foodlab_runtime/.env" -f supabase/selfhost/compose.yml exec -T db pg_restore --list < "$backup_name" > "$backup_name.list"
rg -q 'TABLE public foodlab_states' "$backup_name.list"
echo 'Database backup created in the protected runtime backups directory. Preserve the runtime .env alongside it.'
