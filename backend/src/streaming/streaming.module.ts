import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { StreamManagerService } from './stream-manager.service';
import { StorageService } from './storage.service';

@Module({
  imports: [EventsModule],
  providers: [StreamManagerService, StorageService],
  exports: [StreamManagerService, StorageService],
})
export class StreamingModule {}
