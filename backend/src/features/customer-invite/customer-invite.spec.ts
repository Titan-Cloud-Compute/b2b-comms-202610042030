import { ConflictException, BadRequestException } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { CustomerInviteController } from './customer-invite.controller';
import { CustomerInviteService } from './customer-invite.service';

function makePrisma() {
  const users: any[] = [];
  const customers: any[] = [];
  let n = 0;
  const find = (arr: any[], where: any) =>
    arr.find(r => Object.entries(where).every(([k, v]) => r[k] === v)) ?? null;
  return {
    users,
    customers,
    user: {
      findUnique: jest.fn(async ({ where }: any) => find(users, where)),
      create: jest.fn(async ({ data }: any) => {
        const u = { id: `u${++n}`, createdAt: new Date(), ...data };
        users.push(u);
        return u;
      }),
    },
    customer: {
      findUnique: jest.fn(async ({ where }: any) => find(customers, where)),
      create: jest.fn(async ({ data }: any) => {
        const c = { id: `c${++n}`, createdAt: new Date(), ...data };
        customers.push(c);
        return c;
      }),
      findMany: jest.fn(async () => customers.map(c => ({ id: c.id, email: c.email }))),
    },
  };
}

describe('customer-invite', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let controller: CustomerInviteController;

  beforeEach(() => {
    prisma = makePrisma();
    controller = new CustomerInviteController(new CustomerInviteService(prisma as never));
  });

  it('routes to /api/admin/customers/invite and /api/admin/customers', () => {
    expect(Reflect.getMetadata(PATH_METADATA, CustomerInviteController)).toBe('api/admin/customers');
    expect(
      Reflect.getMetadata(PATH_METADATA, CustomerInviteController.prototype.postApiAdminCustomersInvite),
    ).toBe('invite');
  });

  it('admin invites customer: creates a Customer and returns invitationSent true', async () => {
    const res = await controller.postApiAdminCustomersInvite({ email: 'buyer@corp.example.com' });
    expect(res).toEqual({ customerId: expect.any(String), email: 'buyer@corp.example.com', invitationSent: true });
    expect(prisma.customers).toHaveLength(1);
    expect(prisma.users).toHaveLength(1);
    expect(prisma.customers[0].userId).toBe(prisma.users[0].id);
  });

  it('duplicate invite rejected with 409', async () => {
    await controller.postApiAdminCustomersInvite({ email: 'buyer@corp.example.com' });
    const err = await controller
      .postApiAdminCustomersInvite({ email: 'buyer@corp.example.com' })
      .catch(e => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.getStatus()).toBe(409);
    expect(String(err.message).toLowerCase()).toContain('customer already exists');
  });

  it('rejects an invalid email', async () => {
    await expect(controller.postApiAdminCustomersInvite({ email: 'nope' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lists customers as { id, email }', async () => {
    await controller.postApiAdminCustomersInvite({ email: 'a@x.com' });
    expect(await controller.getApiAdminCustomers()).toEqual([{ id: expect.any(String), email: 'a@x.com' }]);
  });
});
