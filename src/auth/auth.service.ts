import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { UsersService } from '../users/users.service';
import { WalletService } from '../wallet/wallet.service';
import { RegisterDto } from './dto/register.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { User } from '../users/entities/user.entity';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly walletService: WalletService,
    private readonly jwtService: JwtService,
    private readonly dataSource: DataSource,
  ) {}

  async validateUser(email: string, password: string): Promise<User | null> {
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      return null;
    }

    const matches = await bcrypt.compare(password, user.password);

    if (!matches) {
      return null;
    }

    return user;
  }

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const existingEmail = await this.usersService.findByEmail(dto.email);

    if (existingEmail) {
      throw new ConflictException('Email already in use');
    }

    const existingUsername = await this.usersService.findByUsername(dto.username);

    if (existingUsername) {
      throw new ConflictException('Username already taken');
    }

    let referredById: string | undefined;

    if (dto.referralCode) {
      const referrer = await this.usersService.findByReferralCode(dto.referralCode);
      referredById = referrer?.id;
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const user = await this.dataSource.transaction(async (manager) => {
      const newUser = manager.create(User, {
        email: dto.email,
        username: dto.username,
        password: hashedPassword,
        phone: dto.phone,
        referralCode: uuidv4().replace(/-/g, '').slice(0, 12).toUpperCase(),
        referredBy: referredById,
      });

      const savedUser = await manager.save(newUser);

      await this.walletService.createWallet(savedUser.id);

      return savedUser;
    });

    this.logger.log(`User registered: ${user.id}`);

    return this.buildAuthResponse(user);
  }

  async login(user: User): Promise<AuthResponseDto> {
    return this.buildAuthResponse(user);
  }

  private buildAuthResponse(user: User): AuthResponseDto {
    const payload = { sub: user.id, email: user.email, isAdmin: user.isAdmin };
    const accessToken = this.jwtService.sign(payload);

    const response = new AuthResponseDto();
    response.accessToken = accessToken;
    response.user = UserResponseDto.fromEntity(user);

    return response;
  }
}
