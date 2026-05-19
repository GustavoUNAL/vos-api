import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../common/roles.guard';
import { PosEventsService } from './pos-events.service';
import { PosGateway } from './pos.gateway';
import { PosOrdersController } from './pos-orders.controller';
import { PosOrdersService } from './pos-orders.service';
import { PosTablesController } from './pos-tables.controller';
import { PosTablesService } from './pos-tables.service';

@Module({
  imports: [AuthModule],
  controllers: [PosTablesController, PosOrdersController],
  providers: [
    RolesGuard,
    PosGateway,
    PosEventsService,
    PosTablesService,
    PosOrdersService,
  ],
  exports: [PosTablesService, PosOrdersService, PosEventsService],
})
export class PosModule {}
