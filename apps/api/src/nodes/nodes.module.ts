import { Module } from '@nestjs/common';
import { CostService } from './cost.service';
import { NodesController } from './nodes.controller';
import { NodesService } from './nodes.service';

@Module({
  controllers: [NodesController],
  providers: [NodesService, CostService],
  exports: [NodesService, CostService],
})
export class NodesModule {}
