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

psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set="post_password=${POST_DB_PASSWORD:-$POSTGRES_PASSWORD}" \
  --set="post_database=${POST_DB_NAME:-posts}" <<'SQL'
SELECT format('CREATE ROLE post_service LOGIN PASSWORD %L', :'post_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'post_service') \gexec

SELECT format('CREATE DATABASE %I OWNER post_service', :'post_database')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'post_database') \gexec
SQL
# Optional until NotificationService is configured. Uses a separate role/database.
if [ -n "${NOTIFICATION_DB_PASSWORD:-}" ]; then
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set="notification_password=$NOTIFICATION_DB_PASSWORD" \
  --set="notification_database=${NOTIFICATION_DB_NAME:-notifications}" <<'SQL'
SELECT format('CREATE ROLE notification_service LOGIN PASSWORD %L', :'notification_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'notification_service') \gexec
SELECT format('CREATE DATABASE %I OWNER notification_service', :'notification_database')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'notification_database') \gexec
SQL
fi
