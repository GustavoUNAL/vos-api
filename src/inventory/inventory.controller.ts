import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CreateInventoryDto } from './dto/create-inventory.dto';
import { UpdateInventoryDto } from './dto/update-inventory.dto';
import { InventoryService } from './inventory.service';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post()
  create(@Body() dto: CreateInventoryDto) {
    return this.inventoryService.create(dto);
  }

  @Get()
  findAll(
    @Query('page') pageRaw?: string,
    @Query('limit') limitRaw?: string,
    @Query('search') search?: string,
    @Query('categoryId') categoryId?: string,
    @Query('lot') lot?: string,
    @Query('traceProductCode') traceProductCode?: string,
    @Query('internalBarcode') internalBarcode?: string,
    @Query('includeStats') includeStatsRaw?: string,
  ) {
    const page = Number.parseInt(pageRaw ?? '', 10);
    const parsedPage = Number.isFinite(page) && page > 0 ? page : 1;
    const limitParsed = Number.parseInt(limitRaw ?? '', 10);
    const hasLimit = Number.isFinite(limitParsed) && limitParsed > 0;
    // Para vistas de lote, siempre devolver el lote completo (ignora `limit` del cliente).
    const parsedLimit = lot?.trim() ? 1000 : hasLimit ? limitParsed : 20;

    const includeStats = ['1', 'true', 'yes'].includes(
      includeStatsRaw?.trim().toLowerCase() ?? '',
    );
    return this.inventoryService.findAll({
      page: parsedPage,
      limit: parsedLimit,
      search,
      categoryId,
      lot,
      traceProductCode,
      internalBarcode,
      includeStats,
    });
  }

  /** Lectura por pistola / escáner: código interno EAN-13 del ítem. */
  @Get('by-internal-barcode/:barcode')
  findByInternalBarcode(@Param('barcode') barcode: string) {
    return this.inventoryService.findByInternalBarcode(barcode);
  }

  /** Cuántos lotes de compra distintos tienen ítems con este `traceProductCode`. */
  @Get('meta/purchase-trace')
  purchaseTrace(@Query('traceProductCode') traceProductCode?: string) {
    return this.inventoryService.getPurchaseTraceSummary(
      traceProductCode ?? '',
    );
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @Query('includeStats') includeStatsRaw?: string,
  ) {
    const includeStats = ['1', 'true', 'yes'].includes(
      includeStatsRaw?.trim().toLowerCase() ?? '',
    );
    return this.inventoryService.findOne(id, includeStats);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateInventoryDto) {
    return this.inventoryService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.inventoryService.remove(id);
  }
}
