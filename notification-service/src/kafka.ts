import { Kafka, type SASLOptions } from 'kafkajs';
import type { ConfigService } from '@nestjs/config';
export function notificationKafka(config: ConfigService, clientId: string) {
  const username = config.get<string>('KAFKA_SASL_USERNAME'),
    password = config.get<string>('KAFKA_SASL_PASSWORD');
  return new Kafka({
    clientId,
    brokers: config.get<string>('KAFKA_BROKERS', '127.0.0.1:9092').split(','),
    ssl: config.get('KAFKA_SSL') === 'true',
    ...(username && password
      ? {
          sasl: {
            mechanism: 'scram-sha-256',
            username,
            password,
          } as SASLOptions,
        }
      : {}),
    requestTimeout: 10000,
    retry: { retries: 2 },
  });
}
