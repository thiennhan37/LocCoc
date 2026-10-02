import { Module } from '@nestjs/common';
import { RedisThrottlerStorage } from './redis-throttler.storage.js';

// providers: Module này có những dependency/service nào mà NestJS quản lý?
// exports: Module này cung cấp dependency/service nào cho các module khác sử dụng?
@Module({ providers: [RedisThrottlerStorage], exports: [RedisThrottlerStorage] })
export class RedisModule {}
