#!/bin/sh
set -eu
psql -v ON_ERROR_STOP=1 -f /migrations/schema.sql
for file in /migrations/changes/*.sql; do
  [ -f "$file" ] || continue
  psql -v ON_ERROR_STOP=1 -f "$file"
done
psql -v ON_ERROR_STOP=1 -c "NOTIFY pgrst, 'reload schema';"
