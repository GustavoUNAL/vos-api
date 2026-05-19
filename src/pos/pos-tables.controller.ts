import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtPayload } from '../auth/jwt.types';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { CurrentUser } from './common/current-user.decorator';
import { CreatePosTableDto } from './dto/create-pos-table.dto';
import { UpdatePosTableDto } from './dto/update-pos-table.dto';
import { PosTablesService } from './pos-tables.service';

@Controller('pos/tables')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PosTablesController {
  constructor(private readonly tables: PosTablesService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.MESERO, UserRole.CAJERO, UserRole.EMPLEADO)
  list() {
    return this.tables.listTables();
  }

  @Post()
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreatePosTableDto) {
    return this.tables.create(dto);
  }

  @Patch(':tableId')
  @Roles(UserRole.ADMIN, UserRole.MESERO, UserRole.CAJERO)
  update(@Param('tableId') tableId: string, @Body() dto: UpdatePosTableDto) {
    return this.tables.update(tableId, dto);
  }

  @Post(':tableId/open')
  @Roles(UserRole.ADMIN, UserRole.MESERO, UserRole.CAJERO)
  open(@Param('tableId') tableId: string, @CurrentUser() user?: JwtPayload) {
    return this.tables.open(tableId, user?.sub);
  }

  @Post(':tableId/close')
  @Roles(UserRole.ADMIN, UserRole.MESERO, UserRole.CAJERO)
  close(@Param('tableId') tableId: string) {
    return this.tables.closeTable(tableId);
  }

  @Post(':tableId/reserve')
  @Roles(UserRole.ADMIN, UserRole.MESERO, UserRole.CAJERO)
  reserve(@Param('tableId') tableId: string) {
    return this.tables.reserve(tableId);
  }

  @Post(':tableId/unreserve')
  @Roles(UserRole.ADMIN, UserRole.MESERO, UserRole.CAJERO)
  unreserve(@Param('tableId') tableId: string) {
    return this.tables.unreserve(tableId);
  }
}
