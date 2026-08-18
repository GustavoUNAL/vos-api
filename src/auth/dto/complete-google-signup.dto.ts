import { IsBoolean, IsString, MinLength } from 'class-validator';

export class CompleteGoogleSignupDto {
  @IsString()
  @MinLength(20)
  signupToken!: string;

  @IsString()
  @MinLength(2)
  companyName!: string;

  @IsBoolean()
  acceptTerms!: boolean;

  @IsBoolean()
  acceptPrivacy!: boolean;
}
