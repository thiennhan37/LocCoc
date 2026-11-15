import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, registerDecorator } from 'class-validator';

export class DirectChatDto {
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.toLowerCase() : value)
  @IsUUID() peerId!: string;
}
export class SendMessageDto {
  @IsUUID() clientMessageId!: string;
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @UnicodeText() text!: string;
}
function UnicodeText(): PropertyDecorator {
  return (object, propertyName) => registerDecorator({
    name: 'unicodeText', target: object.constructor, propertyName: String(propertyName),
    validator: { validate: (value: unknown) => typeof value === 'string' && [...value].length >= 1 && [...value].length <= 2000 && !value.includes('\0'), defaultMessage: () => 'text must contain 1 to 2000 Unicode characters' },
  });
}
export class ConversationListDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit = 20;
  @IsOptional() @IsString() @MaxLength(512) cursor?: string;
}
export class HistoryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 25;
  @IsOptional() @Matches(/^(0|[1-9][0-9]{0,17})$/) before?: string;
  @IsOptional() @Matches(/^(0|[1-9][0-9]{0,17})$/) after?: string;
}
export class ReadChatDto {
  @Matches(/^(0|[1-9][0-9]{0,17})$/) sequence!: string;
}
