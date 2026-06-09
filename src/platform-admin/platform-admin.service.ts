import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { slugifyCompanyLabel } from '../auth/company-slug';

@Injectable()
export class PlatformAdminService {
  constructor(private readonly prisma: PrismaService) {}

  private slugFromCompany(name: string, shopSlug: string | null): string {
    return shopSlug?.trim() || slugifyCompanyLabel(name);
  }

  async overview() {
    const [
      companiesCount,
      activeCompanies,
      usersCount,
      pendingRequests,
      recentRequests,
    ] = await Promise.all([
      this.prisma.company.count(),
      this.prisma.company.count({ where: { status: 'ACTIVE' } }),
      this.prisma.user.count({ where: { active: true } }),
      this.prisma.accessRequest.count({ where: { status: 'PENDING' } }),
      this.prisma.accessRequest.findMany({
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
    ]);

    return {
      companiesCount,
      activeCompanies,
      usersCount,
      pendingRequests,
      recentRequests,
    };
  }

  async listCompanies() {
    const companies = await this.prisma.company.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: {
            members: true,
            products: true,
            sales: true,
            shopOrders: true,
          },
        },
        companyModules: {
          where: { isEnabled: true },
          include: { module: { select: { slug: true, name: true } } },
          orderBy: { module: { sortOrder: 'asc' } },
        },
      },
    });

    return companies.map((c) => ({
      id: c.id,
      name: c.name,
      slug: this.slugFromCompany(c.name, c.shopSlug),
      shopSlug: c.shopSlug,
      status: c.status,
      email: c.email,
      phone: c.phone,
      membersCount: c._count.members,
      productsCount: c._count.products,
      salesCount: c._count.sales,
      shopOrdersCount: c._count.shopOrders,
      modules: c.companyModules.map((cm) => ({
        slug: cm.module.slug,
        name: cm.module.name,
      })),
    }));
  }

  async companyDetail(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      include: {
        _count: {
          select: {
            members: true,
            products: true,
            sales: true,
            inventoryItems: true,
            purchaseLots: true,
            staffMembers: true,
            shopOrders: true,
          },
        },
        companyModules: {
          where: { isEnabled: true },
          include: { module: { select: { slug: true, name: true } } },
          orderBy: { module: { sortOrder: 'asc' } },
        },
        members: {
          include: {
            user: { select: { id: true, email: true, name: true, active: true } },
            memberRoles: {
              include: { role: { select: { slug: true, name: true } } },
            },
          },
          orderBy: { joinedAt: 'asc' },
        },
      },
    });

    if (!company) return null;

    return {
      id: company.id,
      name: company.name,
      slug: this.slugFromCompany(company.name, company.shopSlug),
      shopSlug: company.shopSlug,
      status: company.status,
      email: company.email,
      phone: company.phone,
      address: company.address,
      counts: {
        members: company._count.members,
        products: company._count.products,
        sales: company._count.sales,
        inventoryItems: company._count.inventoryItems,
        purchaseLots: company._count.purchaseLots,
        staffMembers: company._count.staffMembers,
        shopOrders: company._count.shopOrders,
      },
      modules: company.companyModules.map((cm) => ({
        slug: cm.module.slug,
        name: cm.module.name,
      })),
      members: company.members.map((m) => ({
        id: m.user.id,
        email: m.user.email,
        name: m.user.name,
        active: m.user.active,
        status: m.status,
        roles: m.memberRoles.map((mr) => mr.role.slug),
      })),
    };
  }

  async listUsers() {
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        name: true,
        active: true,
        isPlatformAdmin: true,
        createdAt: true,
        memberships: {
          include: {
            company: { select: { id: true, name: true, shopSlug: true } },
            memberRoles: { include: { role: { select: { slug: true } } } },
          },
        },
      },
    });

    return users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      active: u.active,
      isPlatformAdmin: u.isPlatformAdmin,
      createdAt: u.createdAt,
      companies: u.memberships.map((m) => ({
        id: m.company.id,
        name: m.company.name,
        slug: this.slugFromCompany(m.company.name, m.company.shopSlug),
        role: m.memberRoles[0]?.role.slug ?? 'member',
        status: m.status,
      })),
    }));
  }

  async listAccessRequests(status?: string) {
    const where =
      status === 'PENDING' || status === 'APPROVED' || status === 'REJECTED'
        ? { status: status as 'PENDING' | 'APPROVED' | 'REJECTED' }
        : undefined;

    return this.prisma.accessRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
}
