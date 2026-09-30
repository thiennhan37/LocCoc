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
