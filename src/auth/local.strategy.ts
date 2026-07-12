import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import { AuthService } from './auth.service';
import { User } from '../users/entities/user.entity';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly authService: AuthService) {
    super({ usernameField: 'identifier' });
  }

  async validate(identifier: string, password: string): Promise<User> {
    const user = await this.authService.validateUser(identifier, password);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return user;
  }
}
