import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { JwtAuthGuard, JwtVerifier, RolesGuard } from '@loccoc/common';

// Run against compiled common code and Node's real package resolution, without
// Vite deduplication masking duplicate Nest providers in the pnpm workspace.
test('shared guards resolve the application Nest providers', async () => {
  assert.equal(Reflect.getMetadata('design:paramtypes', JwtAuthGuard)[0], Reflector);
  assert.equal(Reflect.getMetadata('design:paramtypes', JwtAuthGuard)[1], ConfigService);
  assert.equal(Reflect.getMetadata('design:paramtypes', RolesGuard)[0], Reflector);

  const module = await Test.createTestingModule({
    providers: [Reflector, ConfigService, JwtVerifier, JwtAuthGuard, RolesGuard],
  }).compile();
  try {
    assert.ok(module.get(JwtAuthGuard) instanceof JwtAuthGuard);
    assert.ok(module.get(RolesGuard) instanceof RolesGuard);
  } finally {
    await module.close();
  }
});
