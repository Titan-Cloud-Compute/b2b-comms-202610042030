import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { FeatureService } from '../../common/feature';
import { PrismaService } from '../../prisma/prisma.service';
import type { SessionPayload } from '../../auth/session.types';
import type {
  GetApiOrdersResponseDto,
  PatchApiOrdersIdConfirmResponseDto,
  PostApiOrdersRequestDto,
  PostApiOrdersResponseDto,
} from './order-management.dto';

@Injectable()
export class OrderManagementService extends FeatureService {
  constructor(prisma: PrismaService) {
    super(prisma, ['Order', 'OrderItem'] as const);
  }

  async createOrder(
    userId: string,
    dto: PostApiOrdersRequestDto,
  ): Promise<PostApiOrdersResponseDto> {
    const { vendorId, items = [] } = dto ?? {};

    if (!vendorId || typeof vendorId !== 'string') {
      throw new BadRequestException('vendorId is required');
    }

    const customer = await this.prisma.customer.findUnique({ where: { userId } });
    if (!customer) throw new ForbiddenException('no customer record for this user');

    const vendor = await this.prisma.vendorProfile.findUnique({ where: { id: vendorId } });
    if (!vendor) throw new NotFoundException('vendor not found');

    const order = await this.prisma.order.create({
      data: {
        status: 'pending',
        customerId: customer.id,
        vendorId: vendor.id,
        orderItems: {
          create: items.map((item) => ({
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          })),
        },
      },
    });

    return { id: order.id, status: order.status, customerId: order.customerId };
  }

  async listOrders(
    session: Pick<SessionPayload, 'userId' | 'role'>,
  ): Promise<GetApiOrdersResponseDto[]> {
    let customerId: string | undefined;
    let vendorId: string | undefined;

    if (session.role === UserRole.CUSTOMER) {
      const customer = await this.prisma.customer.findUnique({
        where: { userId: session.userId },
      });
      if (!customer) return [];
      customerId = customer.id;
    } else if (session.role === UserRole.VENDOR) {
      const vendor = await this.prisma.vendorProfile.findUnique({
        where: { userId: session.userId },
      });
      if (!vendor) return [];
      vendorId = vendor.id;
    }
    // ADMIN: no filter — customerId and vendorId stay undefined

    const orders = await this.prisma.order.findMany({
      where: { customerId, vendorId },
      orderBy: { createdAt: 'desc' },
    });

    return orders.map((o) => ({
      id: o.id,
      status: o.status,
      vendorId: o.vendorId,
      customerId: o.customerId,
      createdAt: o.createdAt,
    }));
  }

  async confirmOrder(
    userId: string,
    orderId: string,
    estimatedDelivery: unknown,
  ): Promise<PatchApiOrdersIdConfirmResponseDto> {
    if (!estimatedDelivery || typeof estimatedDelivery !== 'string') {
      throw new BadRequestException('estimatedDelivery is required');
    }
    const parsed = new Date(estimatedDelivery);
    if (isNaN(parsed.getTime())) {
      throw new BadRequestException('estimatedDelivery must be a valid date (YYYY-MM-DD)');
    }

    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('order not found');

    const vendor = await this.prisma.vendorProfile.findUnique({ where: { userId } });
    if (!vendor || order.vendorId !== vendor.id) {
      throw new ForbiddenException('you do not own this order');
    }

    if (order.status !== 'pending') {
      throw new ConflictException('order is not pending');
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: 'confirmed' },
    });

    return { id: updated.id, status: 'confirmed', estimatedDelivery };
  }
}
