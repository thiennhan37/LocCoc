import { Controller, Get, Post, Body, HttpException, HttpStatus } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { IsString } from 'class-validator';
import { RateLimit } from '@loccoc/common';

class EchoDto {
  @IsString()
  value!: string;
}

@Controller('health')
export class HealthController {
  @Get()
  // SkipThrottle: bỏ qua rate limiting cho endpoint này. 
  // Thường dùng cho các endpoint health check hoặc auth public.
  @SkipThrottle()
  check() { return { status: 'ok' }; }

  // Small contract probes used by the e2e suite; replace with real auth routes.
  @Post('echo')
  @RateLimit(2, 60_000)
  echo(@Body() body: EchoDto) { return body; }

  @Get('error')
  error(): never { throw new HttpException('simulated failure', HttpStatus.INTERNAL_SERVER_ERROR); }
}
