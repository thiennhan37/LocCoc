#!/bin/sh
set -eu
: "${POSTGRES_USER:?Set POSTGRES_USER}"
: "${CHAT_DB_PASSWORD:?Set CHAT_DB_PASSWORD}"
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "${POSTGRES_DB:-postgres}" \
  --set="chat_password=$CHAT_DB_PASSWORD" --set="chat_database=${CHAT_DB_NAME:-chat}" <<'SQL'
SELECT format('CREATE ROLE chat_service LOGIN PASSWORD %L', :'chat_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'chat_service') \gexec
SELECT format('CREATE DATABASE %I OWNER chat_service', :'chat_database')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'chat_database') \gexec
SQL
