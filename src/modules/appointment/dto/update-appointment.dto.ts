import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateAppointmentDto {
  @IsString()
  @MinLength(2)
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsDateString()
  @IsOptional()
  scheduled_at?: string;

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
