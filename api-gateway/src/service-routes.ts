export const SERVICE_ROUTES = {
  auth: {
    prefix: '/auth',
    urlConfigKey: 'AUTH_SERVICE_URL',
  },
  users: {
    prefix: '/users',
    urlConfigKey: 'USER_SERVICE_URL',
  },
  ai: {
    prefix: '/ai',
    urlConfigKey: 'AI_SERVICE_URL',
  },
} as const;

export type ServiceName = keyof typeof SERVICE_ROUTES;
