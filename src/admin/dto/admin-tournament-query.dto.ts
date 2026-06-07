import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginatedQueryDto } from '../../common/dto/paginated-query.dto';
import { TournamentStatus } from '../../tournaments/types/tournament-status.enum';
import { TournamentArena } from '../../tournaments/types/tournament-arena.enum';

export class AdminTournamentQueryDto extends PaginatedQueryDto {
  @ApiPropertyOptional({ enum: TournamentStatus })
  @IsOptional()
  @IsEnum(TournamentStatus)
  status?: TournamentStatus;

  @ApiPropertyOptional({ enum: TournamentArena })
  @IsOptional()
  @IsEnum(TournamentArena)
  arena?: TournamentArena;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
}
