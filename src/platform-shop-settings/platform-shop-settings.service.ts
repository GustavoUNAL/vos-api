import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, ProductStatus, ShopOrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { TenantContext } from '../tenant/tenant.types';
import { UpdateShopSettingsDto } from './dto/update-shop-settings.dto';

const SHOP_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

@Injectable()
export class PlatformShopSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private normalizeSlug(raw: string | null | undefined): string | null {
    if (raw === null || raw === undefined) return null;
    const trimmed = raw.trim().toLowerCase();
    if (!trimmed) return null;
    if (!SHOP_SLUG_RE.test(trimmed)) {
      throw new BadRequestException(
        'El slug solo puede tener minúsculas, números y guiones (2–48 caracteres)',
      );
    }
    return trimmed;
  }

  private buildPublicUrls(slug: string | null) {
    const frontBase = (
      this.config.get<string>('SHOP_FRONT_URL') ??
      this.config.get<string>('VITE_SHOP_FRONT_URL') ??
      'http://localhost:5173'
    ).replace(/\/$/, '');

    if (!slug) {
      return {
        frontBase,
        catalogUrlHash: null,
        catalogUrlPath: null,
        embedIframeHtml: null,
      };
    }

    const catalogUrlHash = `${frontBase}/#/tienda/${slug}`;
    const catalogUrlPath = `${frontBase}/tienda/${slug}`;
    const embedIframeHtml = `<iframe src="${catalogUrlHash}?embed=1" title="Pedidos ${slug}" width="100%" height="720" style="border:0;border-radius:12px" loading="lazy" allow="payment"></iframe>`;

    return {
      frontBase,
      catalogUrlHash,
      catalogUrlPath,
      embedIframeHtml,
    };
  }

  async getSettings(tenant: TenantContext) {
    const company = await this.prisma.company.findFirst({
      where: { id: tenant.companyId, status: 'ACTIVE' },
      select: { id: true, name: true, shopSlug: true },
    });
    if (!company) throw new NotFoundException('Empresa no encontrada');

    const [activeProducts, pendingOrders] = await Promise.all([
      this.prisma.product.count({
        where: { companyId: tenant.companyId, status: ProductStatus.ACTIVE },
      }),
      this.prisma.shopOrder.count({
        where: {
          companyId: tenant.companyId,
          status: {
            in: [
              ShopOrderStatus.PENDING,
              ShopOrderStatus.PREPARING,
              ShopOrderStatus.DELIVERED,
            ],
          },
        },
      }),
    ]);

    const urls = this.buildPublicUrls(company.shopSlug);

    return {
      companyId: company.id,
      companyName: company.name,
      shopSlug: company.shopSlug,
      enabled: Boolean(company.shopSlug),
      activeProducts,
      pendingOrders,
      ...urls,
      apiCatalogPath: company.shopSlug
        ? `/public/shop/${company.shopSlug}/catalog`
        : null,
    };
  }

  async updateSettings(tenant: TenantContext, dto: UpdateShopSettingsDto) {
    const nextSlug =
      dto.shopSlug === undefined
        ? undefined
        : this.normalizeSlug(dto.shopSlug);

    if (nextSlug) {
      const taken = await this.prisma.company.findFirst({
        where: {
          shopSlug: { equals: nextSlug, mode: 'insensitive' },
          id: { not: tenant.companyId },
        },
        select: { id: true },
      });
      if (taken) {
        throw new BadRequestException('Ese slug ya está en uso por otra empresa');
      }
    }

    const data: Prisma.CompanyUpdateInput = {};
    if (nextSlug !== undefined) data.shopSlug = nextSlug;

    const company = await this.prisma.company.update({
      where: { id: tenant.companyId },
      data,
      select: { id: true, name: true, shopSlug: true },
    });

    const urls = this.buildPublicUrls(company.shopSlug);

    return {
      companyId: company.id,
      companyName: company.name,
      shopSlug: company.shopSlug,
      enabled: Boolean(company.shopSlug),
      ...urls,
    };
  }
}
