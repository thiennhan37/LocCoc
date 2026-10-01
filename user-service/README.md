# user-service

This NestJS service is an empty application shell. It starts on port 8081 and exposes no application API or authentication endpoint. Routes such as `/` and `/oauth/callback` return 404.

## Run

```powershell
cd user-service
pnpm install
pnpm run start:dev
```

Set `PORT` in the process environment if a different port is needed. This service does not read the root `.env` file.

## Verify

```powershell
pnpm run build
pnpm run lint
pnpm run test
pnpm run test:e2e
```

JWT verification, user endpoints and any identity service integration are future work. Add them only after the identity contract is defined.
