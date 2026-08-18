import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';
import { CreateAccessRequestDto } from './dto/create-access-request.dto';

function planLabel(plan?: string | null): string {
  if (plan === 'PRO') return 'Pro';
  if (plan === 'BUSINESS') return 'Empresa';
  if (plan === 'TRIAL') return 'Free';
  return 'Registro';
}

@Injectable()
export class AccessRequestsService {
  private readonly log = new Logger(AccessRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramService,
  ) {}

  async create(dto: CreateAccessRequestDto) {
    const interest = dto.plan ? `Plan solicitado: ${planLabel(dto.plan)}` : null;
    const message = [interest, dto.message?.trim()].filter(Boolean).join('\n') || null;

    const row = await this.prisma.accessRequest.create({
      data: {
        companyName: dto.companyName.trim(),
        contactName: dto.contactName.trim(),
        email: dto.email.trim().toLowerCase(),
        phone: dto.phone?.trim() || null,
        message,
      },
    });

    const alert = [
      `VOS IA · ${planLabel(dto.plan)}`,
      `Empresa: ${row.companyName}`,
      `Contacto: ${row.contactName}`,
      `Email: ${row.email}`,
      `WhatsApp: ${row.phone ?? '—'}`,
      row.message ? `Nota: ${row.message}` : null,
      'Revisá Solicitudes en el panel admin.',
    ]
      .filter(Boolean)
      .join('\n');

    this.log.warn(`[ACCESS REQUEST] ${alert.replace(/\n/g, ' | ')}`);
    void this.telegram.sendInternalNotification(alert);

    return {
      ok: true,
      id: row.id,
      message:
        dto.plan === 'PRO' || dto.plan === 'BUSINESS'
          ? 'Recibimos tu interés. Gustavo te contacta para activar el plan.'
          : 'Recibimos tu registro. Te contactaremos con tus credenciales de acceso.',
    };
  }
}
