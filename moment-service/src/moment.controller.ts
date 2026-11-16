import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import { CurrentUser, type AuthenticatedUser } from "@loccoc/common";
import type { Request, Response } from "express";
import {
  CreateMomentDto,
  SearchMomentsDto,
  ListMomentsDto,
} from "./moment.dto.js";
import { MomentService } from "./moment.service.js";
import { readImage } from "./image.policy.js";

@Controller("moments")
export class MomentController {
  constructor(private readonly service: MomentService) {}
  @Post() create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateMomentDto,
  ) {
    return this.service.create(user.userId, body);
  }
  @Get() list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() dto: ListMomentsDto,
  ) {
    return this.service.list(user.userId, dto);
  }
  @Post("search") search(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: SearchMomentsDto,
  ) {
    return this.service.search(user.userId, body);
  }
  @Get(":id") get(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.get(user.userId, id);
  }
  @Put(":id/image") async upload(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.service.upload(
      user.userId,
      id,
      await readImage(req),
      req.headers["content-type"]!,
    );
  }
  @Get(":id/image") async image(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const bytes = await this.service.image(user.userId, id);
    res
      .set({
        "content-type": "image/jpeg",
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      })
      .send(bytes);
  }
  @Delete(":id") remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.remove(user.userId, id);
  }
  @Post(":id/retry-index") retry(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.retry(user.userId, id);
  }
}
