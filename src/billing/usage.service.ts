import {
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const TRIAL_LIMITS = {
  storageBytes: 25 * 1024 * 1024,
  products: 40,
  sales: 80,
  purchases: 40,
  inventory: 40,
  appointments: 60,
} as const;

export type CompanyPlanId = 'TRIAL' | 'PRO' | 'BUSINESS';

export function isUnlimitedPlan(plan: CompanyPlanId): boolean {
  return plan === 'PRO' || plan === 'BUSINESS';
}

export type CompanyUsage = {
  plan: CompanyPlanId;
  storageUsedBytes: number;
  storageLimitBytes: number;
  percent: number;
  products: number;
  sales: number;
  purchases: number;
  inventory: number;
  appointments: number;
  overLimit: boolean;
  offerPro: boolean;
  limitLabel: string | null;
};

export function summarizeUsage(input: {
  plan: CompanyPlanId;
  storageUsedBytes: number;
  storageLimitBytes: number;
  products: number;
  sales: number;
  purchases: number;
  inventory: number;
  appointments: number;
}): CompanyUsage {
  const paid = isUnlimitedPlan(input.plan);
  const storageLimitBytes = paid
    ? 0
    : input.storageLimitBytes || TRIAL_LIMITS.storageBytes;

  const storageOver =
    !paid &&
    storageLimitBytes > 0 &&
    input.storageUsedBytes >= storageLimitBytes;
  const recordsOver =
    !paid &&
    (input.products >= TRIAL_LIMITS.products ||
      input.sales >= TRIAL_LIMITS.sales ||
      input.purchases >= TRIAL_LIMITS.purchases ||
      input.inventory >= TRIAL_LIMITS.inventory ||
      input.appointments >= TRIAL_LIMITS.appointments);

  let limitLabel: string | null = null;
  if (storageOver) limitLabel = 'almacenamiento';
  else if (input.products >= TRIAL_LIMITS.products) limitLabel = 'productos';
  else if (input.sales >= TRIAL_LIMITS.sales) limitLabel = 'ventas';
  else if (input.purchases >= TRIAL_LIMITS.purchases) limitLabel = 'compras';
  else if (input.inventory >= TRIAL_LIMITS.inventory) limitLabel = 'inventario';
  else if (input.appointments >= TRIAL_LIMITS.appointments) limitLabel = 'citas';

  const ratios = [
    storageLimitBytes > 0 ? input.storageUsedBytes / storageLimitBytes : 0,
    input.products / TRIAL_LIMITS.products,
    input.sales / TRIAL_LIMITS.sales,
    input.purchases / TRIAL_LIMITS.purchases,
    input.inventory / TRIAL_LIMITS.inventory,
    input.appointments / TRIAL_LIMITS.appointments,
  ];
  const percent = Math.min(100, Math.round(Math.max(0, ...ratios) * 100));

  return {
    plan: input.plan,
    storageUsedBytes: input.storageUsedBytes,
    storageLimitBytes,
    percent: paid ? 0 : percent,
    products: input.products,
    sales: input.sales,
    purchases: input.purchases,
    inventory: input.inventory,
    appointments: input.appointments,
    overLimit: storageOver || recordsOver,
    offerPro: input.plan === 'TRIAL' && percent >= 70,
    limitLabel,
  };
}

@Injectable()
export class UsageService {
  constructor(private readonly prisma: PrismaService) {}

  async getUsage(companyId: string): Promise<CompanyUsage | null> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { plan: true, storageLimitBytes: true },
    });
    if (!company) return null;

    const [
      products,
      sales,
      purchases,
      inventory,
      appointments,
      storageRows,
    ] = await Promise.all([
      this.prisma.product.count({ where: { companyId } }),
      this.prisma.sale.count({ where: { companyId } }),
      this.prisma.purchaseLot.count({ where: { companyId } }),
      this.prisma.inventoryItem.count({ where: { companyId } }),
      this.prisma.bookingAppointment.count({ where: { companyId } }),
      this.prisma.$queryRaw<Array<{ bytes: bigint | number | null }>>`
        SELECT (
          COALESCE((SELECT SUM(octet_length("receipt_image_data_url")) FROM sales WHERE company_id = ${companyId} AND "receipt_image_data_url" IS NOT NULL), 0)
          + COALESCE((SELECT SUM(octet_length("receipt_image_data_url")) FROM purchase_lots WHERE company_id = ${companyId} AND "receipt_image_data_url" IS NOT NULL), 0)
          + COALESCE((SELECT SUM(octet_length(url)) FROM product_images WHERE company_id = ${companyId}), 0)
        )::bigint AS bytes
      `,
    ]);

    return summarizeUsage({
      plan: company.plan,
      storageUsedBytes: Number(storageRows[0]?.bytes ?? 0),
      storageLimitBytes: company.storageLimitBytes,
      products,
      sales,
      purchases,
      inventory,
      appointments,
    });
  }

  async getStorageByCompanyIds(
    companyIds: string[],
  ): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    const unique = [...new Set(companyIds.filter(Boolean))];
    if (!unique.length) return map;

    const rows = await this.prisma.$queryRaw<
      Array<{ company_id: string; bytes: bigint | number | null }>
    >(Prisma.sql`
      SELECT x.company_id, (
        COALESCE((SELECT SUM(octet_length("receipt_image_data_url")) FROM sales WHERE company_id = x.company_id AND "receipt_image_data_url" IS NOT NULL), 0)
        + COALESCE((SELECT SUM(octet_length("receipt_image_data_url")) FROM purchase_lots WHERE company_id = x.company_id AND "receipt_image_data_url" IS NOT NULL), 0)
        + COALESCE((SELECT SUM(octet_length(url)) FROM product_images WHERE company_id = x.company_id), 0)
      )::bigint AS bytes
      FROM (VALUES ${Prisma.join(unique.map((id) => Prisma.sql`(${id})`))}) AS x(company_id)
    `);

    for (const row of rows) {
      map.set(row.company_id, Number(row.bytes ?? 0));
    }
    return map;
  }

  async assertWithinQuota(companyId: string): Promise<CompanyUsage | null> {
    const usage = await this.getUsage(companyId);
    if (!usage || isUnlimitedPlan(usage.plan) || !usage.overLimit) return usage;
    throw new ForbiddenException({
      code: 'TRIAL_LIMIT',
      message: `Llegaste al límite de la prueba (${usage.limitLabel ?? 'espacio'}).`,
      hint: 'Pasate a VOS IA Pro para seguir cargando datos sin tope.',
      usage,
    });
  }
}
