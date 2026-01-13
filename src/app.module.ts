import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { VehiclesModule } from './vehicles/vehicles.module';
import { UsersModule } from './users/users.module';
import { InteractionsModule } from './interactions/interactions.module';
import { DealersModule } from './dealers/dealers.module';

@Module({
  imports: [
    PrismaModule,
    VehiclesModule,
    UsersModule,
    InteractionsModule,
    DealersModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
