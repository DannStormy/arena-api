import { BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, Patch, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/types/jwt-payload.type';
import { UserResponseDto } from './dto/user-response.dto';
import { UserProfileDto } from './dto/user-profile.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateBankDetailsDto } from './dto/update-bank-details.dto';
import { PaystackService } from '../services/paystack/paystack.service';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly paystackService: PaystackService,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  async getMe(@CurrentUser() user: JwtPayload): Promise<UserResponseDto> {
    return this.usersService.getMe(user.sub);
  }

  @Patch('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update current user profile' })
  @ApiBody({ type: UpdateUserDto })
  @ApiResponse({ status: 200, schema: { example: { success: true } } })
  async updateMe(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateUserDto,
  ): Promise<{ success: true }> {
    return this.usersService.updateMe(user.sub, dto);
  }

  @Get('me/profile')
  @ApiOperation({ summary: 'Get current user full profile (XP, level, rank, duel record)' })
  @ApiResponse({ status: 200, type: UserProfileDto })
  async getMyProfile(@CurrentUser() user: JwtPayload): Promise<UserProfileDto> {
    return this.usersService.getProfile(user.sub);
  }

  @Get('me/stats')
  @ApiOperation({ summary: 'Get current user stats' })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        tournamentsPlayed: 5,
        questionsAnswered: 50,
        correctAnswers: 38,
        accuracy: 76,
        totalPrizeWon: '2500.00',
      },
    },
  })
  async getMyStats(@CurrentUser() user: JwtPayload) {
    return this.usersService.getMyStats(user.sub);
  }

  @Patch('me/bank-details')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update current user bank details' })
  @ApiBody({ type: UpdateBankDetailsDto })
  @ApiResponse({ status: 200, schema: { example: { success: true } } })
  async updateBankDetails(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateBankDetailsDto,
  ): Promise<{ success: true }> {
    return this.usersService.updateBankDetails(user.sub, dto);
  }

  @Get('bank/resolve')
  @ApiOperation({ summary: 'Resolve a bank account number to account name' })
  @ApiQuery({ name: 'accountNumber', required: true, type: String })
  @ApiQuery({ name: 'bankCode', required: true, type: String })
  @ApiResponse({ status: 200, schema: { example: { accountName: 'John Doe' } } })
  @ApiResponse({ status: 400, description: 'Invalid account number or bank code' })
  async resolveBankAccount(
    @Query('accountNumber') accountNumber: string,
    @Query('bankCode') bankCode: string,
  ): Promise<{ accountName: string }> {
    try {
      const accountName = await this.paystackService.resolveAccount(accountNumber, bankCode);
      return { accountName };
    } catch {
      throw new BadRequestException('Could not resolve account. Check the account number and bank code.');
    }
  }
}
