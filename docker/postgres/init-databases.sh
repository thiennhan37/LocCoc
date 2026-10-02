#!/bin/sh

psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set="user_password=$USER_DB_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE user_service LOGIN PASSWORD %L', :'user_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'user_service') \gexec

SELECT 'CREATE DATABASE "user" OWNER user_service'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'user') \gexec
SQL

psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set="auth_password=$AUTH_DB_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE auth_service LOGIN PASSWORD %L', :'auth_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'auth_service') \gexec

SELECT 'CREATE DATABASE auth OWNER auth_service'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'auth') \gexec
SQL
