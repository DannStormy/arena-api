import { Injectable, InternalServerErrorException, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DuelConfig } from './entities/duel-config.entity';
import { UpdateDuelConfigDto } from './dto/update-duel-config.dto';

@Injectable()
export class DuelConfigService implements OnModuleInit {
  private readonly logger = new Logger(DuelConfigService.name);

  constructor(
    @InjectRepository(DuelConfig)
    private readonly configRepo: Repository<DuelConfig>,
  ) {}

  async onModuleInit(): Promise<void> {
    const existing = await this.configRepo.findOne({ where: {} });

    if (!existing) {
      await this.configRepo.save(this.configRepo.create());
      this.logger.log('DuelConfig seeded with defaults');
    }
  }

  async getConfig(): Promise<DuelConfig> {
    const config = await this.configRepo.findOne({ where: {} });

    if (!config) {
      throw new InternalServerErrorException('DuelConfig not found');
    }

    return config;
  }

  async updateConfig(dto: UpdateDuelConfigDto): Promise<{ success: true }> {
    const config = await this.getConfig();

    Object.assign(config, dto);

    await this.configRepo.save(config);

    this.logger.log('DuelConfig updated');

    return { success: true };
  }
}
