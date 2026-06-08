import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreatePurchaseLotDto } from './dto/create-purchase-lot.dto';
import { ReplacePurchaseLotLinesDto } from './dto/replace-purchase-lot-lines.dto';
import { UpdatePurchaseLotDto } from './dto/update-purchase-lot.dto';
import { PurchaseLotsService } from './purchase-lots.service';

@UseGuards(JwtAuthGuard)
@Controller('purchase-lots')
export class PurchaseLotsController {
  constructor(private readonly purchaseLotsService: PurchaseLotsService) {}

  @Get('meta/suppliers')
  suppliersMeta() {
    return this.purchaseLotsService.listDistinctSuppliers();
  }

  /** Agregado por día para la vista calendario de compras. */
  @Get('calendar')
  calendar(
    @Query('year', ParseIntPipe) year: number,
    @Query('month', ParseIntPipe) month: number,
  ) {
    return this.purchaseLotsService.getCalendar(year, month);
  }

  @Post()
  create(@Body() dto: CreatePurchaseLotDto) {
    return this.purchaseLotsService.createManual(dto);
  }

  @Get()
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search') search?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.purchaseLotsService.findAll({
      page,
      limit,
      search,
      dateFrom,
      dateTo,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.purchaseLotsService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePurchaseLotDto) {
    return this.purchaseLotsService.update(id, dto);
  }

  /** Reemplaza líneas de comprobante (costo histórico) y alinea `totalValue` del lote con la suma. */
  @Put(':id/purchase-lines')
  replacePurchaseLines(
    @Param('id') id: string,
    @Body() dto: ReplacePurchaseLotLinesDto,
  ) {
    return this.purchaseLotsService.replacePurchaseLotLines(id, dto);
  }
}
