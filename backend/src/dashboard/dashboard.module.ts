import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { StreamingModule } from '../streaming/streaming.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [StreamingModule, EventsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
