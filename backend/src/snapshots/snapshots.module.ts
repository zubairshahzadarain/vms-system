import { Module } from '@nestjs/common';
import { StreamingModule } from '../streaming/streaming.module';
import { SnapshotsController } from './snapshots.controller';

@Module({
  imports: [StreamingModule],
  controllers: [SnapshotsController],
})
export class SnapshotsModule {}
