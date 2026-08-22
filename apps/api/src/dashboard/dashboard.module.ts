import { Module } from '@nestjs/common';
import { NodesModule } from '../nodes/nodes.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [NodesModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
