#!/bin/sh

psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set="keycloak_password=$KEYCLOAK_DB_PASSWORD" \
  --set="user_password=$USER_DB_PASSWORD" <<'SQL'
CREATE ROLE keycloak LOGIN PASSWORD :'keycloak_password';
CREATE DATABASE keycloak OWNER keycloak;
CREATE ROLE user_service LOGIN PASSWORD :'user_password';
CREATE DATABASE "user" OWNER user_service;
SQL
