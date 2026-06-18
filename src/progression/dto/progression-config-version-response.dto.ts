import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProgressionConfigVersion } from '../entities/progression-config-version.entity';
import type { ProgressionConfigValues } from '../types/progression-config.types';

export class ProgressionConfigVersionResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  values: ProgressionConfigValues;

  @ApiProperty()
  effectiveFrom: Date;

  @ApiPropertyOptional({ nullable: true })
  changedBy: string | null;

  @ApiPropertyOptional({ nullable: true })
  notes: string | null;

  @ApiProperty()
  createdAt: Date;

  static fromEntity(entity: ProgressionConfigVersion): ProgressionConfigVersionResponseDto {
    const dto = new ProgressionConfigVersionResponseDto();
    dto.id = entity.id;
    dto.values = entity.values;
    dto.effectiveFrom = entity.effectiveFrom;
    dto.changedBy = entity.changedBy;
    dto.notes = entity.notes;
    dto.createdAt = entity.createdAt;
    return dto;
  }
}
