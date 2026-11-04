import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CurrentUser, type AuthenticatedUser } from '@loccoc/common';
import {
  ClaimUsernameDto,
  PageDto,
  RequestsQueryDto,
  SearchUsersDto,
  SendRequestDto,
  UsernameProfileDto,
} from './social.dto.js';
import { SocialService } from './social.service.js';

@Controller('users')
export class SocialController {
  constructor(private readonly service: SocialService) {}
  @Post('me/username')
  claim(
    @CurrentUser() u: AuthenticatedUser,
    @Body() dto: ClaimUsernameDto,
    @Headers('authorization') token: string,
  ) {
    return this.service.claim(u.userId, dto, token);
  }
  @Get('search')
  search(@CurrentUser() u: AuthenticatedUser, @Query() dto: SearchUsersDto) {
    return this.service.search(u.userId, dto);
  }
  @Get('profiles/by-username/:username')
  profileByUsername(
    @CurrentUser() u: AuthenticatedUser,
    @Param() dto: UsernameProfileDto,
    @Headers('authorization') token: string,
  ) {
    return this.service.profileByUsername(u.userId, dto.username, token);
  }
  @Get('profiles/:id')
  profile(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('authorization') token: string,
  ) {
    return this.service.profile(u.userId, id, token);
  }
  @Get('friends')
  friends(@CurrentUser() u: AuthenticatedUser, @Query() dto: PageDto) {
    return this.service.friends(u.userId, dto);
  }
  @Get('me/social-summary')
  summary(@CurrentUser() u: AuthenticatedUser) {
    return this.service.summary(u.userId);
  }
  @Get('friend-requests')
  requests(
    @CurrentUser() u: AuthenticatedUser,
    @Query() dto: RequestsQueryDto,
  ) {
    return this.service.requests(u.userId, dto);
  }
  @Get('friend-requests/:id')
  requestDetail(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('authorization') token: string,
  ) {
    return this.service.requestDetail(u.userId, id, token);
  }
  @Post('friend-requests')
  send(
    @CurrentUser() u: AuthenticatedUser,
    @Body() dto: SendRequestDto,
    @Headers('authorization') token: string,
  ) {
    return this.service.send(u.userId, dto.receiverId, token);
  }
  @Post('friend-requests/:id/accept')
  @HttpCode(200)
  accept(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('authorization') token: string,
  ) {
    return this.service.resolve(u.userId, id, 'ACCEPTED', token);
  }
  @Post('friend-requests/:id/reject')
  @HttpCode(200)
  reject(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('authorization') token: string,
  ) {
    return this.service.resolve(u.userId, id, 'REJECTED', token);
  }
  @Post('friend-requests/:id/cancel')
  @HttpCode(200)
  cancel(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('authorization') token: string,
  ) {
    return this.service.resolve(u.userId, id, 'CANCELLED', token);
  }
  @Delete('friends/:id')
  @HttpCode(204)
  unfriend(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('authorization') token: string,
  ) {
    return this.service.unfriend(u.userId, id, token);
  }
  @Put('blocks/:id')
  @HttpCode(204)
  block(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('authorization') token: string,
  ) {
    return this.service.block(u.userId, id, token);
  }
  @Delete('blocks/:id')
  @HttpCode(204)
  unblock(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.unblock(u.userId, id);
  }
  @Get('blocks')
  blocks(@CurrentUser() u: AuthenticatedUser, @Query() dto: PageDto) {
    return this.service.blocks(u.userId, dto);
  }
}
