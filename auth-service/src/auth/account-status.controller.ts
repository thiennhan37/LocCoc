import {
  Body,
  Controller,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
} from '@nestjs/common';
import { IsIn } from 'class-validator';
import { Roles } from '@loccoc/common';
import { AccountAccessService } from './account-access.service.js';

class StatusDto {
  @IsIn(['active', 'suspended']) status!: 'active' | 'suspended';
}
@Controller('auth/accounts')
export class AccountStatusController {
  constructor(private readonly accounts: AccountAccessService) {}
  @Patch(':id/status')
  @Roles('admin')
  status(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StatusDto,
    @Headers('authorization') token: string,
  ) {
    return this.accounts.setStatus(id, dto.status, token);
  }
}
