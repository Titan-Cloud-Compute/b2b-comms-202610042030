import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FeatureService } from '../../common/feature';
import { PrismaService } from '../../prisma/prisma.service';
import type { SessionPayload } from '../../auth/session.types';
import {
  GetApiInvoicesIdDownloadResponseDto,
  PostApiInvoicesRequestDto,
  PostApiInvoicesResponseDto,
} from './invoice-generation.dto';

@Injectable()
export class InvoiceGenerationService extends FeatureService {
  constructor(prisma: PrismaService) {
    super(prisma, ['Invoice', 'Order'] as const);
  }

  async create(dto: PostApiInvoicesRequestDto): Promise<PostApiInvoicesResponseDto> {
    const amount = Number(dto?.amount);
    if (!dto?.orderId || typeof dto.orderId !== 'string' || !Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('orderId and a positive amount are required');
    }
    const order = await this.model('Order').findUnique({ where: { id: dto.orderId } });
    if (!order) throw new NotFoundException('order not found');
    if (String(order.status).toLowerCase() !== 'confirmed') {
      throw new BadRequestException('invoices can only be generated for confirmed orders');
    }
    const existing = await this.model('Invoice').findUnique({ where: { orderId: order.id } });
    if (existing) throw new ConflictException('an invoice already exists for this order');
    const invoice = await this.model('Invoice').create({ data: { orderId: order.id, amount } });
    return { id: invoice.id, orderId: invoice.orderId, amount: invoice.amount };
  }

  async findForSession(id: string, session?: SessionPayload) {
    const invoice = await this.model('Invoice').findUnique({
      where: { id },
      include: { order: { include: { customer: true } } },
    });
    if (!invoice) throw new NotFoundException('invoice not found');
    if (session?.role === 'CUSTOMER' && invoice.order?.customer?.userId !== session.userId) {
      throw new ForbiddenException('not your invoice');
    }
    return invoice;
  }

  async downloadLink(id: string, session?: SessionPayload): Promise<GetApiInvoicesIdDownloadResponseDto> {
    const invoice = await this.findForSession(id, session);
    return { id: invoice.id, downloadUrl: `/api/invoices/${encodeURIComponent(invoice.id)}/file` };
  }

  async renderFile(id: string, session?: SessionPayload): Promise<string> {
    const inv = await this.findForSession(id, session);
    return [
      `INVOICE ${inv.id}`,
      `Order: ${inv.orderId}`,
      `Amount: ${inv.amount.toFixed(2)}`,
      `Issued: ${inv.createdAt.toISOString()}`,
      '',
    ].join('\n');
  }
}
