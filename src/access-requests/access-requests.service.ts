import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAccessRequestDto } from './dto/create-access-request.dto';

@Injectable()
export class AccessRequestsService {
  private readonly log = new Logger(AccessRequestsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateAccessRequestDto) {
    const row = await this.prisma.accessRequest.create({
      data: {
        companyName: dto.companyName.trim(),
        contactName: dto.contactName.trim(),
        email: dto.email.trim().toLowerCase(),
        phone: dto.phone?.trim() || null,
        message: dto.message?.trim() || null,
      },
    });

    const adminEmail = process.env.ADMIN_NOTIFY_EMAIL?.trim() || 'admin@vos.ai';
    this.log.warn(
      `[ACCESS REQUEST] Nueva solicitud → revisar en DB id=${row.id} | ` +
        `empresa="${row.companyName}" | contacto="${row.contactName}" | ` +
        `email=${row.email} | notificar=${adminEmail}`,
    );

    return {
      ok: true,
      id: row.id,
      message:
        'Recibimos tu solicitud. Te contactaremos pronto con tus credenciales de acceso.',
    };
  }
}
