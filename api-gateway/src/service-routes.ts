export const SERVICE_ROUTES = {
  auth: {
    prefix: '/auth',
    urlConfigKey: 'AUTH_SERVICE_URL',
  },
  notifications: {
    prefix: '/notifications',
    urlConfigKey: 'NOTIFICATION_SERVICE_URL',
  },
  users: {
    prefix: '/users',
    urlConfigKey: 'USER_SERVICE_URL',
  },
  ai: {
    prefix: '/ai',
    urlConfigKey: 'AI_SERVICE_URL',
  },
  admin: {
    prefix: '/admin',
    urlConfigKey: 'ADMIN_SERVICE_URL',
  },
  payments: {
    prefix: '/payments',
    urlConfigKey: 'PAYMENT_SERVICE_URL',
  },
  subscriptions: {
    prefix: '/subscriptions',
    urlConfigKey: 'PAYMENT_SERVICE_URL',
  },
} as const;

export type ServiceName = keyof typeof SERVICE_ROUTES;
