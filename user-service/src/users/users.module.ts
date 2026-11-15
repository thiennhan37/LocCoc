import { DiscoveryController } from '../discovery/discovery.controller.js';
import { MediaController } from '../media/media.controller.js';
import { MediaService } from '../media/media.service.js';
import { MediaStorage } from '../media/media.storage.js';
import { MediaRepository } from '../media/media.repository.js';
import { Module } from '@nestjs/common';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { User } from './entities/user.entity.js';
import { UsersRepository } from './users.repository.js';
import { UsersService } from './users.service.js';
import { UsersController } from './users.controller.js';
import { SocialModule } from '../social/social.module.js';
import { SocialController } from '../social/social.controller.js';

const isTest = process.env.NODE_ENV === 'test';

@Module({
  imports: [
    SocialModule,
    ...(isTest ? [] : [TypeOrmModule.forFeature([User])]),
  ],
  controllers: [MediaController, DiscoveryController, SocialController, UsersController],
  providers: [
    MediaService,
    MediaRepository,
    MediaStorage,
    UsersRepository,
    UsersService,
    ...(isTest ? [{ provide: getRepositoryToken(User), useValue: {} }] : []),
  ],
  exports: [UsersService, UsersRepository],
})
export class UsersModule {}
