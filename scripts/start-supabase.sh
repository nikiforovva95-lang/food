#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
foodlab_runtime="${FOODLAB_RUNTIME:-/workspace/food-runtime}"
node scripts/setup-selfhost.mjs
chmod 644 supabase/selfhost/roles.sql
# A bind mount does not auto-populate image defaults like a named Docker volume.
# Copy only absent files; preserve any existing custom PostgreSQL settings.
if [ ! -f "$foodlab_runtime/db-config/wal-g.conf" ] || [ ! -f "$foodlab_runtime/db-config/supautils.conf" ]; then
  env -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH docker --host=unix:///var/run/docker.sock run --rm --user 0 --entrypoint sh --mount "type=bind,src=$foodlab_runtime/db-config,dst=/foodlab-config" supabase/postgres:17.6.1.136 -c 'for f in /etc/postgresql-custom/*; do name=${f##*/}; if [ ! -e "/foodlab-config/$name" ]; then cp -a "$f" /foodlab-config/; fi; done'
fi
docker_args=(--host=unix:///var/run/docker.sock compose --env-file "$foodlab_runtime/.env" -f supabase/selfhost/compose.yml)
env -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH docker "${docker_args[@]}" up -d --wait --wait-timeout 180 db
env -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH docker "${docker_args[@]}" up -d --wait --wait-timeout 180
# Auth health confirms that auth.users and auth migrations exist.
env -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH docker "${docker_args[@]}" exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/schema.sql
env -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH docker "${docker_args[@]}" exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "NOTIFY pgrst, 'reload schema';"
echo 'FoodLab Supabase is ready; schema and RLS applied.'
