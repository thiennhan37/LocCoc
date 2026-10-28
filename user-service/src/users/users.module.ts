import { Module } from '@nestjs/common';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { User } from './entities/user.entity.js';
import { UsersRepository } from './users.repository.js';
import { UsersService } from './users.service.js';
import { UsersController } from './users.controller.js';

const isTest = process.env.NODE_ENV === 'test';

@Module({
  imports: isTest ? [] : [TypeOrmModule.forFeature([User])],
  controllers: [UsersController],
  providers: [
    UsersRepository,
    UsersService,
    ...(isTest ? [{ provide: getRepositoryToken(User), useValue: {} }] : []),
  ],
  exports: [UsersService, UsersRepository],
})
export class UsersModule {}
