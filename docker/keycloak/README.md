# LocCoc Keycloak (local development)

`loc-coc-realm.json` is imported by Keycloak itself at startup. No separate
provisioning container or script is needed. It creates the `loc-coc` realm,
the `loccoc-mobile` client, and the realm role `user`. The role is not assigned
to users automatically.

Before the first `docker compose up -d`, set `MOBILE_REDIRECT_URI` in `.env` to
the exact HTTPS App Link / Universal Link callback owned by the team. It is
intentionally blank in `.env.example` because the domain has not been chosen.
The URI is substituted into the JSON by Keycloak during import. Android
`assetlinks.json`, iOS `apple-app-site-association`, and the native app settings
must also match. This repository cannot establish domain ownership by itself.

The mobile client is **public**, with Authorization Code + PKCE S256. It has
no `clientSecret`: a secret shipped inside a Flutter APK/IPA cannot be kept
secret. Standard flow is enabled; direct access grants, implicit flow, and
service accounts are disabled. If the future NextJS server needs a confidential
client, configure a separate web client and keep its secret on the server.

Access tokens live for 900 seconds (15 minutes). Refresh token rotation is
enabled with zero reuse. The mobile client session idle and maximum lifespans
are 86,400 seconds (24 hours), with the parent SSO session set to 90,000
seconds (25 hours). This aims for a 24-hour online refresh window, not a
guarantee that one unchanged refresh token stays valid for exactly 24 hours:
rotation replaces it, inactivity and logout can end the session earlier, and
later tokens cannot extend the client session maximum. Do not request
`offline_access` for this flow. Realm-level token and SSO settings will also
affect future clients in `loc-coc`; review them when adding web SSO.

Keycloak's startup import **skips an existing realm**. Editing the JSON and
restarting Compose will not update an already-imported `loc-coc` realm. For an
existing realm, make deliberate changes in the Admin Console or plan a
controlled import/migration with a backup; do not delete the database volume
just to reapply this file. This is the main tradeoff of the simpler JSON-only
approach.

Flutter OIDC settings:

- Issuer: `${KEYCLOAK_HOSTNAME}/realms/loc-coc`
- Client ID: `loccoc-mobile`
- Redirect URI: the exact `MOBILE_REDIRECT_URI` from `.env`
- Scopes: `openid profile email`

The Keycloak server in Compose uses HTTP only for local development. A real
device must reach the configured issuer URL. Shared and production deployments
need HTTPS.
