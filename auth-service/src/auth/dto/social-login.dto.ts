import { IsJWT, IsString, Length, ValidateIf } from 'class-validator';

export class SocialLoginDto {
  @IsJWT()
  @Length(1, 16_384)
  idToken!: string;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsString()
  @Length(1, 256)
  nonce?: string;
}

export class AppleSocialLoginDto extends SocialLoginDto {
  // Apple's name is absent from the signed ID token. This is only an untrusted
  // display suggestion, never an identity claim or input to account linking.
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsString()
  @Length(1, 200)
  name?: string;
}
