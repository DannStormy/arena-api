import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TransactionType } from '../types/transaction-type.enum';
import { WalletTransaction } from '../entities/wallet-transaction.entity';

export class TransactionResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  walletId: string;

  @ApiProperty({ enum: TransactionType })
  type: TransactionType;

  @ApiProperty()
  amount: string;

  @ApiPropertyOptional()
  reference: string;

  @ApiPropertyOptional()
  description: string;

  @ApiPropertyOptional()
  meta: Record<string, unknown>;

  @ApiProperty()
  createdAt: Date;

  static fromEntity(tx: WalletTransaction): TransactionResponseDto {
    const dto = new TransactionResponseDto();

    dto.id = tx.id;
    dto.walletId = tx.walletId;
    dto.type = tx.type;
    dto.amount = tx.amount;
    dto.reference = tx.reference;
    dto.description = tx.description;
    dto.meta = tx.meta;
    dto.createdAt = tx.createdAt;

    return dto;
  }
}
