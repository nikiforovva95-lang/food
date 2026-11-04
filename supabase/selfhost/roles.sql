-- Minimal subset of Supabase's official docker/volumes/db/roles.sql.
-- These are the only service roles used by this FoodLab stack.
-- psql reads the already-injected value without logging it.
\getenv pgpass POSTGRES_PASSWORD
ALTER USER authenticator WITH PASSWORD :'pgpass';
ALTER USER supabase_auth_admin WITH PASSWORD :'pgpass';
