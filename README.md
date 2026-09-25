# LocCoc

## Local infrastructure

This Compose stack is for development: PostgreSQL, Keycloak, a single-node
Kafka broker in KRaft mode, and Kafbat UI. Keycloak owns the `keycloak`
database, and User Service owns the `user` database. Each has a separate
PostgreSQL role in the same PostgreSQL instance.

1. Run `Copy-Item .env.example .env` in PowerShell, then replace the sample
   passwords and set `MOBILE_REDIRECT_URI` to the team's exact HTTPS mobile
   callback. Compose will not start Keycloak while this value is blank.
2. Run `docker compose up -d`.
3. Check `docker compose logs keycloak` for the initial realm import.
4. Open `http://localhost:8180` and sign in using the admin credentials in
   `.env`.
5. Open Kafka UI at `http://localhost:9080` to inspect the `loccoc-local`
   cluster.

The tracked Keycloak settings are in `docker/keycloak/loc-coc-realm.json`.
Keycloak imports it on first startup only; an existing realm is skipped.
See `docker/keycloak/README.md` for token/session behavior and this limitation.

From the host: PostgreSQL `localhost:5433` (database `user`, role
`user_service`), Kafka `localhost:9092`, Keycloak `http://localhost:8180`,
Kafka UI `http://localhost:9080`.
From other Compose containers: `db:5432`, `kafka:19092`, `keycloak:8180`.
No host port in the 8080-8090 range is published.

To use Kafka CLI, enable the `tools` profile and run commands in its container:

```powershell
docker compose --profile tools up -d kafka-cli
docker compose --profile tools exec kafka-cli /opt/kafka/bin/kafka-topics.sh --bootstrap-server kafka:19092 --list
```

The database initialization script runs only with an empty PostgreSQL volume.
Changing passwords in `.env` later will not update existing database users.
For Flutter on a real device, set `KEYCLOAK_HOSTNAME` to a URL the device can
reach and `KEYCLOAK_BIND_ADDRESS=0.0.0.0`; mobile and backend must use that
same OIDC issuer. This HTTP and PLAINTEXT Kafka setup is for local development,
not production.
