import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from '../auth/auth.module';
import { CardController } from './card.controller';
import { CardService } from './card.service';

@Module({
  imports: [
    AuthModule,
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            name: 'public-card',
            ttl: config.get<number>('card.publicThrottleTtlSeconds', 60) * 1000,
            limit: config.get<number>('card.publicThrottleLimit', 10),
          },
        ],
      }),
    }),
  ],
  controllers: [CardController],
  providers: [CardService],
  exports: [CardService],
})
export class CardModule {}
