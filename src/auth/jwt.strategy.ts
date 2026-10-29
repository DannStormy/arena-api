import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';
import { JwtPayload } from '../common/types/jwt-payload.type';
import { User } from '../users/entities/user.entity';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  // Admin rights come from the database, not the token, so revoking them takes effect immediately.
  async validate(payload: JwtPayload): Promise<JwtPayload> {
    const user = await this.usersRepo.findOne({
      where: { id: payload.sub },
      select: { id: true, email: true, isAdmin: true },
    });
    if (!user) throw new UnauthorizedException();
    return { sub: user.id, email: user.email, isAdmin: user.isAdmin };
  }
}
