import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AdminExpenseKind } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminExpensesService } from './admin-expenses.service';
import { UpsertAdminExpenseDto } from './dto/upsert-admin-expense.dto';

@UseGuards(JwtAuthGuard)
@Controller('admin-expenses')
export class AdminExpensesController {
  constructor(private readonly service: AdminExpensesService) {}

  @Get()
  list() {
    return this.service.list();
  }

  /** Upsert por `kind` (único). */
  @Put()
  upsert(@Body() dto: UpsertAdminExpenseDto) {
    return this.service.upsert(dto);
  }

  @Delete(':kind')
  remove(@Param('kind') kind: AdminExpenseKind) {
    return this.service.remove(kind);
  }
}

