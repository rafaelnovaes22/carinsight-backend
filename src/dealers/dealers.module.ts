import { Module } from '@nestjs/common';
import { DealersService } from './dealers.service';
import { DealersController } from './dealers.controller';

@Module({
  controllers: [DealersController],
  providers: [DealersService],
})
export class DealersModule {}
