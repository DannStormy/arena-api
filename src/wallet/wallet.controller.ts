import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { WalletService } from './wallet.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/types/jwt-payload.type';
import { WalletResponseDto } from './dto/wallet-response.dto';
import { TransactionResponseDto } from './dto/transaction-response.dto';
import { PaginatedQueryDto } from '../common/dto/paginated-query.dto';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto';

@ApiTags('Wallet')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get()
  @ApiOperation({ summary: 'Get wallet balance and summary' })
  @ApiResponse({ status: 200, type: WalletResponseDto })
  async getWallet(@CurrentUser() user: JwtPayload): Promise<WalletResponseDto> {
    return this.walletService.getWalletSummary(user.sub);
  }

  @Get('transactions')
  @ApiOperation({ summary: 'List paginated transaction history' })
  @ApiResponse({ status: 200, type: PaginatedResponseDto })
  async listTransactions(
    @CurrentUser() user: JwtPayload,
    @Query() query: PaginatedQueryDto,
  ): Promise<PaginatedResponseDto<TransactionResponseDto>> {
    return this.walletService.listTransactions(user.sub, query);
  }
}
