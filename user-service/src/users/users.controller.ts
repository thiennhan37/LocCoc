import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import {
  CheckOwnership,
  CurrentUser,
  Roles,
  type AuthenticatedUser,
} from '@loccoc/common';
import { UsersService } from './users.service.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { ListUsersQueryDto } from './dto/list-users-query.dto.js';
import { User } from './entities/user.entity.js';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles('moderator', 'admin')
  listUsers(
    @Query() query: ListUsersQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ data: User[]; total: number; page: number; limit: number }> {
    return this.usersService.listUsers(query, user);
  }

  @Get('me')
  getMyProfile(@CurrentUser() user: AuthenticatedUser): Promise<User> {
    return this.usersService.getMyProfile(user.userId);
  }

  @Get(':id')
  @CheckOwnership({ bypassRoles: ['admin', 'moderator'] })
  getUserById(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<User> {
    return this.usersService.getUserById(id, user);
  }

  @Patch('me')
  updateMyProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateUserDto,
  ): Promise<User> {
    return this.usersService.updateMyProfile(user.userId, dto);
  }

  @Patch(':id')
  @Roles('admin')
  updateUserById(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<User> {
    return this.usersService.updateUserById(id, dto, user);
  }

  @Delete('me')
  deleteMyAccount(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.usersService.deleteMyAccount(user.userId);
  }

  @Delete(':id')
  @Roles('admin')
  deleteUserById(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.usersService.deleteUserById(id, user);
  }
}
