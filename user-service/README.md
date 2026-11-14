# user-service

This NestJS service is an empty application shell. It starts on port 8081 and exposes no application API or authentication endpoint.

The service owns the users PostgreSQL database. Its TypeORM connection is configured with synchronize and migrations disabled; no business tables are created yet. Routes such as `/` and `/oauth/callback` return 404.

## Run

```powershell
cd user-service
pnpm install
npm start
```

`npm start` chạy chế độ thường; dùng `npm run start:dev` để watch file.

Set `USER_PORT` in `user-service/.env` if a different port is needed. The service validates its own database, Redis, and JWT public-key settings at startup.

## Verify

```powershell
pnpm run build
pnpm run lint
pnpm run test
pnpm run test:e2e
```

JWT verification, user endpoints and any identity service integration are future work. Add them only after the identity contract is defined.
