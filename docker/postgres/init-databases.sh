#!/bin/sh

set -eu

psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set="user_password=$USER_DB_PASSWORD" \
  --set="user_database=${USER_DB_NAME:-users}" <<'SQL'
SELECT format('CREATE ROLE user_service LOGIN PASSWORD %L', :'user_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'user_service') \gexec

SELECT format('CREATE DATABASE %I OWNER user_service', :'user_database')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'user_database') \gexec
SQL

psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set="auth_password=$AUTH_DB_PASSWORD" \
  --set="auth_database=${AUTH_DB_NAME:-accounts}" <<'SQL'
SELECT format('CREATE ROLE auth_service LOGIN PASSWORD %L', :'auth_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'auth_service') \gexec

SELECT format('CREATE DATABASE %I OWNER auth_service', :'auth_database')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'auth_database') \gexec
SQL