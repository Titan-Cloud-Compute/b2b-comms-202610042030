import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FeatureService } from '../../common/feature';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { SessionPayload } from '../../auth/session.types';
import type {
  GetApiOrdersResponseDto,
  PatchApiOrdersIdConfirmRequestDto,
  PatchApiOrdersIdConfirmResponseDto,
  PostApiOrdersRequestDto,
  PostApiOrdersResponseDto,
} from './order-management.dto';

export const ORDER_STATUS_PENDING = 'pending';
export const ORDER_STATUS_CONFIRMED = 'confirmed';

@Injectable()
export class OrderManagementService extends FeatureService {
  constructor(prisma: PrismaService) {
    super(prisma, ['Order', 'OrderItem'] as const);
  }

  private get db(): PrismaClient {
    return this.prisma as unknown as PrismaClient;
  }

  private async vendorProfileIdFor(userId: string): Promise<string | null> {
    const profile = await this.db.vendorProfile.findUnique({ where: { userId } });
    return profile?.id ?? null;
  }

  async create(session: SessionPayload, dto: PostApiOrdersRequestDto): Promise<PostApiOrdersResponseDto> {
    if (!dto || typeof dto.vendorId !== 'string' || !dto.vendorId.trim()) {
      throw new BadRequestException('vendorId is required');
    }
    const items = Array.isArray(dto.items) ? dto.items : [];
    for (const it of items) {
      if (!it || typeof it.description !== 'string' || !it.description.trim()
        || !Number.isInteger(it.quantity) || it.quantity < 1
        || typeof it.unitPrice !== 'number' || !(it.unitPrice >= 0)) {
        throw new BadRequestException('each item needs description, quantity >= 1 and unitPrice >= 0');
      }
    }
    const customer = await this.db.customer.findUnique({ where: { userId: session.userId } });
    if (!customer) throw new ForbiddenException('only customers can place orders');

    const order = await this.db.order.create({
      data: {
        status: ORDER_STATUS_PENDING,
        customerId: customer.id,
        vendorId: dto.vendorId,
        orderItems: {
          create: items.map((it) => ({
            description: it.description,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
          })),
        },
      },
    });
    return { id: order.id, status: order.status, customerId: order.customerId, vendorId: order.vendorId };
  }

  async confirm(
    session: SessionPayload,
    id: string,
    dto: PatchApiOrdersIdConfirmRequestDto,
  ): Promise<PatchApiOrdersIdConfirmResponseDto> {
    const raw = dto?.estimatedDelivery;
    if (typeof raw !== 'string' || Number.isNaN(Date.parse(raw))) {
      throw new BadRequestException('estimatedDelivery must be a date');
    }
    const order = await this.db.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('order not found');
    if (session.role !== 'ADMIN') {
      const vendorId = await this.vendorProfileIdFor(session.userId);
      if (!vendorId || vendorId !== order.vendorId) {
        throw new ForbiddenException('order belongs to another vendor');
      }
    }
    if (order.status !== ORDER_STATUS_PENDING) {
      throw new BadRequestException(`order is ${order.status}, not pending`);
    }
    const updated = await this.db.order.update({
      where: { id },
      data: { status: ORDER_STATUS_CONFIRMED },
    });
    return { id: updated.id, status: updated.status, estimatedDelivery: raw };
  }

  async list(session: SessionPayload): Promise<GetApiOrdersResponseDto[]> {
    let where: Record<string, unknown> = {};
    if (session.role === 'CUSTOMER') {
      where = { customer: { userId: session.userId } };
    } else if (session.role === 'VENDOR') {
      const vendorId = await this.vendorProfileIdFor(session.userId);
      if (!vendorId) return [];
      where = { vendorId };
    } else if (session.role !== 'ADMIN') {
      throw new ForbiddenException('role not allowed');
    }
    const orders = await this.db.order.findMany({ where, orderBy: { createdAt: 'desc' } });
    return orders.map((o) => ({ id: o.id, status: o.status, customerId: o.customerId, vendorId: o.vendorId }));
  }
}
