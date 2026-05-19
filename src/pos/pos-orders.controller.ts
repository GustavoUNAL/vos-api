import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtPayload } from '../auth/jwt.types';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { CurrentUser } from './common/current-user.decorator';
import { ListPosOrdersQueryDto } from './dto/list-pos-orders-query.dto';
import { PatchPosOrderDto } from './dto/patch-pos-order.dto';
import { PayOrderDto } from './dto/pay-order.dto';
import { PosOrdersService } from './pos-orders.service';

@Controller('pos/orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PosOrdersController {
  constructor(private readonly orders: PosOrdersService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.MESERO, UserRole.CAJERO, UserRole.EMPLEADO)
  list(@Query() query: ListPosOrdersQueryDto) {
    return this.orders.list(query);
  }

  @Get(':orderId')
  @Roles(UserRole.ADMIN, UserRole.MESERO, UserRole.CAJERO, UserRole.EMPLEADO)
  getOne(@Param('orderId') orderId: string) {
    return this.orders.getOne(orderId);
  }

  @Patch(':orderId')
  @Roles(UserRole.ADMIN, UserRole.MESERO, UserRole.CAJERO)
  patch(
    @Param('orderId') orderId: string,
    @Body() dto: PatchPosOrderDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.orders.patch(orderId, dto, user?.sub);
  }

  @Post(':orderId/pay')
  @Roles(UserRole.ADMIN, UserRole.CAJERO, UserRole.MESERO)
  pay(
    @Param('orderId') orderId: string,
    @Body() dto: PayOrderDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.orders.pay(orderId, dto, user?.sub);
  }
}
