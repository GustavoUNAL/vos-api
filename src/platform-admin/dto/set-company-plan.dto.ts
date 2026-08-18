import { IsIn } from 'class-validator';

export class SetCompanyPlanDto {
  @IsIn(['TRIAL', 'PRO', 'BUSINESS'])
  plan!: 'TRIAL' | 'PRO' | 'BUSINESS';
}
