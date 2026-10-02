# user-service

This NestJS service is an empty application shell. It starts on port 8081 and exposes no application API or authentication endpoint. Routes such as `/` and `/oauth/callback` return 404.

## Run

```powershell
cd user-service
pnpm install
npm start
```

`npm start` chạy chế độ thường; dùng `npm run start:dev` để watch file.

Set `USER_PORT` in the root `.env` if a different port is needed. The service uses the shared environment schema and validates database, Redis, CORS and JWT settings at startup.

## Verify

```powershell
pnpm run build
pnpm run lint
pnpm run test
pnpm run test:e2e
```

JWT verification, user endpoints and any identity service integration are future work. Add them only after the identity contract is defined.
