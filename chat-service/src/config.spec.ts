import { validateChatEnvironment } from './config.js';

const credentials = { INTERNAL_SERVICE_TOKEN: 'test-internal-service-token-123456789', CHAT_DB_PASSWORD: 'test-only' };
it('requires service authentication and DB credentials without requiring AI or billing secrets', () => {
  expect(() => validateChatEnvironment({})).toThrow();
  expect(() => validateChatEnvironment({ ...credentials, INTERNAL_SERVICE_TOKEN: 'short' })).toThrow();
  expect(validateChatEnvironment(credentials)).toMatchObject({ CHAT_SERVICE_PORT: 8083, CHAT_DB_NAME: 'chat', CHAT_DB_USER: 'chat_service', TYPEORM_MIGRATIONS_RUN: false });
});
it.each([{ CHAT_SERVICE_PORT: '0' }, { DB_PORT: 'abc' }, { AUTH_SERVICE_URL: 'file:///tmp/auth' }, { TYPEORM_MIGRATIONS_RUN: 'maybe' }])('rejects invalid config %j', invalid => {
  expect(() => validateChatEnvironment({ ...credentials, ...invalid })).toThrow();
});
