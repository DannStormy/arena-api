import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PaystackService } from '../services/paystack/paystack.service';
import { PaystackBank } from '../services/paystack/types/paystack.types';

@ApiTags('Banks')
@Controller('banks')
export class BanksController {
  constructor(private readonly paystackService: PaystackService) {}

  @Get()
  @ApiOperation({ summary: 'List supported banks (NGN)' })
  @ApiResponse({
    status: 200,
    schema: { example: { banks: [{ name: 'Access Bank', code: '044' }] } },
  })
  async getBanks(): Promise<{ banks: PaystackBank[] }> {
    const banks = await this.paystackService.getBanks();
    return { banks };
  }
}
