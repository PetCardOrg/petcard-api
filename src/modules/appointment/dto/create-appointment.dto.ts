import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';

export class CreateAppointmentDto {
  @IsString()
  @MinLength(2)
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsDateString()
  scheduled_at: string;

  @IsInt()
  @Min(15)
  @IsOptional()
  duration_minutes?: number;

  @IsString()
  @IsOptional()
  location?: string;

  @IsUUID()
  @IsOptional()
  pet_id?: string;
}
