import { Body, Controller, Get, Headers, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { ChatService } from './chat.service.js';
import { ConversationListDto, DirectChatDto, HistoryDto, ReadChatDto, SendMessageDto } from './chat.dto.js';
import type { ChatRequest } from './chat.guard.js';

@Controller('chat/conversations')
export class ChatController {
  constructor(@Inject(ChatService) private readonly service: ChatService) {}
  @Post('direct') @HttpCode(200)
  direct(@Req() req: ChatRequest, @Body() body: DirectChatDto, @Headers('authorization') token: string) {
    return this.service.direct(req.user.userId, body.peerId, token);
  }
  @Get()
  list(@Req() req: ChatRequest, @Query() query: ConversationListDto, @Headers('authorization') token: string) {
    return this.service.list(req.user.userId, query.limit, query.cursor, token);
  }
  @Get(':id')
  async detail(@Req() req: ChatRequest, @Param('id', ParseUUIDPipe) id: string, @Headers('authorization') token: string) {
    return { conversation: await this.service.detail(req.user.userId, id, token) };
  }
  @Get(':id/messages')
  history(@Req() req: ChatRequest, @Param('id', ParseUUIDPipe) id: string, @Query() query: HistoryDto) {
    return this.service.history(req.user.userId, id, query);
  }
  @Post(':id/messages') @HttpCode(200)
  send(@Req() req: ChatRequest, @Param('id', ParseUUIDPipe) id: string, @Body() body: SendMessageDto, @Headers('authorization') token: string) {
    return this.service.send(req.user.userId, id, body.clientMessageId, body.text, token);
  }
  @Patch(':id/read')
  read(@Req() req: ChatRequest, @Param('id', ParseUUIDPipe) id: string, @Body() body: ReadChatDto, @Headers('authorization') token: string) {
    return this.service.read(req.user.userId, id, body.sequence, token);
  }
}
