import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { FeatureService } from '../../common/feature';
import { PrismaService } from '../../prisma/prisma.service';
import {
  GetApiAdminCustomersResponseDto,
  PostApiAdminCustomersInviteResponseDto,
} from './customer-invite.dto';

@Injectable()
export class CustomerInviteService extends FeatureService {
  constructor(prisma: PrismaService) {
    super(prisma, ['Customer', 'User'] as const);
  }

  async invite(rawEmail: string | undefined): Promise<PostApiAdminCustomersInviteResponseDto> {
    const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('A valid email is required');
    }
    const customers = this.model('Customer');
    const users = this.model('User');

    const existing = await customers.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('Customer already exists');
    }

    let user = await users.findUnique({ where: { email } });
    if (!user) {
      user = await users.create({ data: { email, role: UserRole.CUSTOMER } });
    }
    const userCustomer = await customers.findUnique({ where: { userId: user.id } });
    if (userCustomer) {
      throw new ConflictException('Customer already exists');
    }

    try {
      const customer = await customers.create({ data: { email, userId: user.id } });
      return { customerId: customer.id, email: customer.email, invitationSent: true };
    } catch (err: any) {
      if (err?.code === 'P2002') throw new ConflictException('Customer already exists');
      throw err;
    }
  }

  async list(): Promise<GetApiAdminCustomersResponseDto[]> {
    const rows = await this.model('Customer').findMany({
      select: { id: true, email: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r: { id: string; email: string }) => ({ id: r.id, email: r.email }));
  }
}
