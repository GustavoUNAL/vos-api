import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Header,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { SaleSource } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../tenant/tenant.guard';
import { PermissionsGuard } from '../tenant/permissions.guard';
import { RequirePermissions } from '../tenant/permissions.decorator';
import { CurrentTenant } from '../tenant/tenant.decorator';
import type { TenantContext } from '../tenant/tenant.types';
import {
  CreateSaleDto,
  SendSaleReceiptDto,
  ReplaceSaleLinesDto,
  UpdateSaleDto,
} from './dto/sale.dto';
import { PlatformSalesService } from './platform-sales.service';

@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller('sales')
export class PlatformSalesController {
  constructor(
    private readonly platformSalesService: PlatformSalesService,
  ) {}

  @Post()
  @RequirePermissions('sales.create')
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateSaleDto) {
    return this.platformSalesService.create(tenant, dto);
  }

  @Get('payment-methods')
  @RequirePermissions('sales.view')
  listPaymentMethods(@CurrentTenant() tenant: TenantContext) {
    return this.platformSalesService.listPaymentMethodsMeta(tenant);
  }

  @Get('calendar')
  @RequirePermissions('sales.view')
  calendar(
    @CurrentTenant() tenant: TenantContext,
    @Query('year', ParseIntPipe) year: number,
    @Query('month', ParseIntPipe) month: number,
  ) {
    return this.platformSalesService.getCalendar(tenant, year, month);
  }

  @Get()
  @RequirePermissions('sales.view')
  findAll(
    @CurrentTenant() tenant: TenantContext,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search') search?: string,
    @Query('source') sourceRaw?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    let source: SaleSource | undefined;
    if (
      sourceRaw &&
      (Object.values(SaleSource) as string[]).includes(sourceRaw)
    ) {
      source = sourceRaw as SaleSource;
    }
    return this.platformSalesService.findAll(tenant, {
      page,
      limit,
      search,
      source,
      dateFrom,
      dateTo,
    });
  }

  @Put(':id/lines')
  @RequirePermissions('sales.update')
  replaceLines(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: ReplaceSaleLinesDto,
  ) {
    return this.platformSalesService.replaceLines(tenant, id, dto);
  }

  @Patch(':id')
  @RequirePermissions('sales.update')
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: UpdateSaleDto,
  ) {
    return this.platformSalesService.update(tenant, id, dto);
  }

  @Get(':id/receipt.txt')
  @RequirePermissions('sales.view')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  async receiptTxt(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const sale = await this.platformSalesService.findOne(tenant, id);
    const text = await this.platformSalesService.getInvoiceReceiptText(tenant, id);
    const code = sale.code ?? id.slice(0, 8);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="comprobante-${code}.txt"`,
    );
    res.send(text);
  }

  @Get(':id/invoice.pdf')
  @RequirePermissions('sales.view')
  @Header('Content-Type', 'application/pdf')
  async invoicePdf(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const sale = await this.platformSalesService.findOne(tenant, id);
    const buf = await this.platformSalesService.getInvoicePdf(tenant, id);
    const code = sale.code ?? id.slice(0, 8);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="comprobante-${code}.pdf"`,
    );
    res.send(buf);
  }

  /** Compatibilidad: misma factura unificada. */
  @Get(':id/invoice/client.pdf')
  @RequirePermissions('sales.view')
  @Header('Content-Type', 'application/pdf')
  async invoiceClientPdf(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    return this.invoicePdf(tenant, id, res);
  }

  /** Compatibilidad: misma factura unificada. */
  @Get(':id/invoice/business.pdf')
  @RequirePermissions('sales.view')
  @Header('Content-Type', 'application/pdf')
  async invoiceBusinessPdf(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    return this.invoicePdf(tenant, id, res);
  }

  @Post(':id/send-receipt')
  @RequirePermissions('sales.update')
  sendReceipt(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: SendSaleReceiptDto,
  ) {
    return this.platformSalesService.sendReceiptWhatsApp(
      tenant,
      id,
      dto.customerPhone,
    );
  }

  @Get(':id')
  @RequirePermissions('sales.view')
  findOne(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.platformSalesService.findOne(tenant, id);
  }
}
