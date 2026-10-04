import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import type { Request } from 'express';
import { ROLES_KEY } from '../../auth/roles.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderManagementController } from './order-management.controller';
import { OrderManagementService } from './order-management.service';

function makePrisma() {
  const orders: any[] = [];
  const customers = [{ id: 'cust-1', userId: 'user-cust', email: 'buyer@corp.example.com' }];
  const vendors = [
    { id: 'vend-1', userId: 'user-vend' },
    { id: 'vend-2', userId: 'user-vend-2' },
  ];
  let seq = 0;
  return {
    orders,
    customer: { findUnique: jest.fn(async ({ where }: any) => customers.find((c) => c.userId === where.userId) ?? null) },
    vendorProfile: { findUnique: jest.fn(async ({ where }: any) => vendors.find((v) => v.userId === where.userId) ?? null) },
    order: {
      create: jest.fn(async ({ data }: any) => {
        const o = { id: `order-${++seq}`, status: data.status, customerId: data.customerId, vendorId: data.vendorId, items: data.orderItems?.create ?? [] };
        orders.push(o);
        return o;
      }),
      findUnique: jest.fn(async ({ where }: any) => orders.find((o) => o.id === where.id) ?? null),
      update: jest.fn(async ({ where, data }: any) => {
        const o = orders.find((x) => x.id === where.id);
        Object.assign(o, data);
        return o;
      }),
      findMany: jest.fn(async ({ where }: any) => orders.filter((o) => {
        if (where.vendorId) return o.vendorId === where.vendorId;
        if (where.customer) return customers.find((c) => c.id === o.customerId)?.userId === where.customer.userId;
        return true;
      })),
    },
  };
}

const req = (userId: string, role: UserRole) => ({ session: { userId, role, firmId: null } }) as unknown as Request;
const customerReq = req('user-cust', UserRole.CUSTOMER);
const vendorReq = req('user-vend', UserRole.VENDOR);
const otherVendorReq = req('user-vend-2', UserRole.VENDOR);

describe('OrderManagementController', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let controller: OrderManagementController;

  beforeEach(() => {
    prisma = makePrisma();
    controller = new OrderManagementController(new OrderManagementService(prisma as unknown as PrismaService));
  });

  it('declares role rules per endpoint', () => {
    const r = new Reflector();
    const proto = OrderManagementController.prototype;
    expect(r.get(ROLES_KEY, proto.postApiOrders)).toEqual([UserRole.CUSTOMER]);
    expect(r.get(ROLES_KEY, proto.patchApiOrdersIdConfirm)).toEqual([UserRole.VENDOR, UserRole.ADMIN]);
    expect(r.get(ROLES_KEY, proto.getApiOrders)).toEqual(
      expect.arrayContaining([UserRole.CUSTOMER, UserRole.VENDOR]),
    );
  });

  it('POST /api/orders returns 201 and stores the order as pending', async () => {
    expect(Reflect.getMetadata('__httpCode__', OrderManagementController.prototype.postApiOrders)).toBe(201);
    const created = await controller.postApiOrders(customerReq, {
      vendorId: 'vend-1',
      items: [{ description: 'Widget', quantity: 2, unitPrice: 9.5 }],
    });
    expect(created).toMatchObject({ status: 'pending', customerId: 'cust-1' });
    expect(created.id).toBeTruthy();
    expect(prisma.orders[0].items).toHaveLength(1);
  });

  it('POST /api/orders rejects a missing vendorId and non-customers', async () => {
    await expect(controller.postApiOrders(customerReq, {} as any)).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.postApiOrders(vendorReq, { vendorId: 'vend-1' })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('PATCH /api/orders/:id/confirm confirms the owning vendor order', async () => {
    const created = await controller.postApiOrders(customerReq, { vendorId: 'vend-1' });
    await expect(
      controller.patchApiOrdersIdConfirm(otherVendorReq, created.id, { estimatedDelivery: '2026-11-01' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      controller.patchApiOrdersIdConfirm(vendorReq, created.id, { estimatedDelivery: 'nope' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      controller.patchApiOrdersIdConfirm(vendorReq, 'missing', { estimatedDelivery: '2026-11-01' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    const confirmed = await controller.patchApiOrdersIdConfirm(vendorReq, created.id, { estimatedDelivery: '2026-11-01' });
    expect(confirmed).toMatchObject({ id: created.id, status: 'confirmed' });

    const customerView = await controller.getApiOrders(customerReq);
    expect(customerView).toEqual([expect.objectContaining({ id: created.id, status: 'confirmed' })]);
  });

  it('GET /api/orders scopes vendors to their own orders', async () => {
    await controller.postApiOrders(customerReq, { vendorId: 'vend-1' });
    expect(await controller.getApiOrders(vendorReq)).toHaveLength(1);
    expect(await controller.getApiOrders(otherVendorReq)).toHaveLength(0);
  });
});
