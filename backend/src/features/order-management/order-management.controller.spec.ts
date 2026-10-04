import { HttpStatus } from '@nestjs/common';
import { HTTP_CODE_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ROLES_KEY } from '../../auth/roles.guard';
import { OrderManagementController } from './order-management.controller';
import { OrderManagementService } from './order-management.service';

// ---------------------------------------------------------------------------
// In-memory Prisma fake
// ---------------------------------------------------------------------------

function makePrisma() {
  const customers: any[] = [];
  const vendors: any[] = [];
  const ordersList: any[] = [];
  let n = 0;

  const find = (arr: any[], where: any): any =>
    arr.find((r) => Object.entries(where as object).every(([k, v]) => r[k] === v)) ?? null;

  return {
    customers,
    vendors,
    ordersList,
    customer: {
      findUnique: jest.fn(async ({ where }: any) => find(customers, where)),
    },
    vendorProfile: {
      findUnique: jest.fn(async ({ where }: any) => find(vendors, where)),
    },
    order: {
      create: jest.fn(async ({ data }: any) => {
        const order = {
          id: `ord${++n}`,
          status: data.status as string,
          customerId: data.customerId as string,
          vendorId: data.vendorId as string,
          createdAt: new Date(),
        };
        ordersList.push(order);
        return order;
      }),
      findMany: jest.fn(async ({ where }: any) =>
        ordersList.filter((o) => {
          if (where?.customerId !== undefined && o.customerId !== where.customerId) return false;
          if (where?.vendorId !== undefined && o.vendorId !== where.vendorId) return false;
          return true;
        }),
      ),
      findUnique: jest.fn(async ({ where }: any) =>
        ordersList.find((o) => o.id === where.id) ?? null,
      ),
      update: jest.fn(async ({ where, data }: any) => {
        const o = ordersList.find((x) => x.id === where.id);
        if (!o) return null;
        Object.assign(o, data);
        return o;
      }),
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const customerReq = (userId: string) =>
  ({ session: { userId, role: 'CUSTOMER' } }) as any;
const vendorReq = (userId: string) =>
  ({ session: { userId, role: 'VENDOR' } }) as any;
const adminReq = (userId: string) =>
  ({ session: { userId, role: 'ADMIN' } }) as any;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OrderManagementController', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let controller: OrderManagementController;

  beforeEach(() => {
    prisma = makePrisma();
    controller = new OrderManagementController(new OrderManagementService(prisma as any));
  });

  // ── routing ──────────────────────────────────────────────────────────────

  it('is mounted at api/orders', () => {
    expect(Reflect.getMetadata(PATH_METADATA, OrderManagementController)).toBe('api/orders');
  });

  it('POST is CUSTOMER-only (VENDOR / other roles get 403 from RolesGuard)', () => {
    expect(
      Reflect.getMetadata(ROLES_KEY, OrderManagementController.prototype.postApiOrders),
    ).toEqual(['CUSTOMER']);
  });

  it('PATCH :id/confirm is VENDOR-only', () => {
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        OrderManagementController.prototype.patchApiOrdersIdConfirm,
      ),
    ).toEqual(['VENDOR']);
  });

  it('POST returns HTTP 201', () => {
    expect(
      Reflect.getMetadata(
        HTTP_CODE_METADATA,
        OrderManagementController.prototype.postApiOrders,
      ),
    ).toBe(HttpStatus.CREATED);
  });

  // ── POST /api/orders ─────────────────────────────────────────────────────

  describe('POST /api/orders', () => {
    beforeEach(() => {
      prisma.customers.push({ id: 'c1', userId: 'u1', email: 'buyer@corp.example.com' });
      prisma.vendors.push({ id: 'vp1', userId: 'uv1' });
    });

    it('201 with {id, status:"pending", customerId} and writes Order + OrderItems', async () => {
      const res = await controller.postApiOrders(customerReq('u1'), {
        vendorId: 'vp1',
        items: [{ description: 'Widget', quantity: 2, unitPrice: 5.5 }],
      });

      expect(res).toEqual({ id: expect.any(String), status: 'pending', customerId: 'c1' });
      expect(prisma.ordersList).toHaveLength(1);
      expect(prisma.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'pending',
            customerId: 'c1',
            vendorId: 'vp1',
            orderItems: {
              create: [{ description: 'Widget', quantity: 2, unitPrice: 5.5 }],
            },
          }),
        }),
      );
    });

    it('403 when caller has no Customer record (e.g. a VENDOR account)', async () => {
      await expect(
        controller.postApiOrders(customerReq('u-no-customer'), { vendorId: 'vp1' }),
      ).rejects.toThrow('no customer record');
    });

    it('404 when vendorId does not exist', async () => {
      await expect(
        controller.postApiOrders(customerReq('u1'), { vendorId: 'nonexistent-vendor' }),
      ).rejects.toThrow('vendor not found');
    });

    it('400 when vendorId is missing', async () => {
      await expect(
        controller.postApiOrders(customerReq('u1'), {} as any),
      ).rejects.toThrow('vendorId is required');
    });
  });

  // ── GET /api/orders ──────────────────────────────────────────────────────

  describe('GET /api/orders', () => {
    beforeEach(() => {
      prisma.customers.push({ id: 'c1', userId: 'u1', email: 'buyer@corp.example.com' });
      prisma.customers.push({ id: 'c2', userId: 'u2', email: 'buyer2@corp.example.com' });
      prisma.vendors.push({ id: 'vp1', userId: 'uv1' });
      prisma.vendors.push({ id: 'vp2', userId: 'uv2' });
      prisma.ordersList.push(
        {
          id: 'o1',
          status: 'pending',
          customerId: 'c1',
          vendorId: 'vp1',
          createdAt: new Date(),
        },
        {
          id: 'o2',
          status: 'confirmed',
          customerId: 'c2',
          vendorId: 'vp2',
          createdAt: new Date(),
        },
      );
    });

    it('CUSTOMER sees only their own orders', async () => {
      const res = await controller.getApiOrders(customerReq('u1'));
      expect(res).toHaveLength(1);
      expect(res[0].id).toBe('o1');
    });

    it('VENDOR sees only orders assigned to their vendor profile', async () => {
      const res = await controller.getApiOrders(vendorReq('uv1'));
      expect(res).toHaveLength(1);
      expect(res[0].id).toBe('o1');
    });

    it('ADMIN sees all orders', async () => {
      const res = await controller.getApiOrders(adminReq('admin-user'));
      expect(res).toHaveLength(2);
    });

    it('returns {id, status, vendorId, customerId, createdAt} shape', async () => {
      const res = await controller.getApiOrders(adminReq('admin-user'));
      expect(res[0]).toMatchObject({
        id: expect.any(String),
        status: expect.any(String),
        vendorId: expect.any(String),
        customerId: expect.any(String),
        createdAt: expect.any(Date),
      });
    });
  });

  // ── PATCH /api/orders/:id/confirm ────────────────────────────────────────

  describe('PATCH /api/orders/:id/confirm', () => {
    beforeEach(() => {
      prisma.customers.push({ id: 'c1', userId: 'u1', email: 'buyer@corp.example.com' });
      prisma.vendors.push({ id: 'vp1', userId: 'uv1' });
      prisma.vendors.push({ id: 'vp2', userId: 'uv2' });
      prisma.ordersList.push({
        id: 'o1',
        status: 'pending',
        customerId: 'c1',
        vendorId: 'vp1',
        createdAt: new Date(),
      });
    });

    it('owning vendor confirms order → {id, status:"confirmed", estimatedDelivery}', async () => {
      const res = await controller.patchApiOrdersIdConfirm(vendorReq('uv1'), 'o1', {
        estimatedDelivery: '2026-12-01',
      });
      expect(res).toMatchObject({ id: 'o1', status: 'confirmed', estimatedDelivery: '2026-12-01' });
    });

    it('403 when a different vendor tries to confirm', async () => {
      await expect(
        controller.patchApiOrdersIdConfirm(vendorReq('uv2'), 'o1', {
          estimatedDelivery: '2026-12-01',
        }),
      ).rejects.toThrow('you do not own this order');
    });

    it('409 when order is already confirmed (non-pending)', async () => {
      await controller.patchApiOrdersIdConfirm(vendorReq('uv1'), 'o1', {
        estimatedDelivery: '2026-12-01',
      });
      await expect(
        controller.patchApiOrdersIdConfirm(vendorReq('uv1'), 'o1', {
          estimatedDelivery: '2026-12-01',
        }),
      ).rejects.toThrow('order is not pending');
    });

    it('400 when estimatedDelivery is missing', async () => {
      await expect(
        controller.patchApiOrdersIdConfirm(vendorReq('uv1'), 'o1', {} as any),
      ).rejects.toThrow('estimatedDelivery is required');
    });

    it('404 when order does not exist', async () => {
      await expect(
        controller.patchApiOrdersIdConfirm(vendorReq('uv1'), 'no-such-order', {
          estimatedDelivery: '2026-12-01',
        }),
      ).rejects.toThrow('order not found');
    });
  });
});
