import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { InvoiceGenerationController } from './invoice-generation.controller';
import { InvoiceGenerationService } from './invoice-generation.service';
import { PrismaService } from '../../prisma/prisma.service';

function makePrisma() {
  return {
    order: { findUnique: jest.fn() },
    invoice: { findUnique: jest.fn(), create: jest.fn() },
  };
}

describe('InvoiceGeneration', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: InvoiceGenerationService;
  let controller: InvoiceGenerationController;

  beforeEach(() => {
    prisma = makePrisma();
    service = new InvoiceGenerationService(prisma as unknown as PrismaService);
    controller = new InvoiceGenerationController(service);
  });

  it('is mounted at api/invoices', () => {
    expect(Reflect.getMetadata(PATH_METADATA, InvoiceGenerationController)).toBe('api/invoices');
  });

  it('creates an invoice for a confirmed order', async () => {
    prisma.order.findUnique.mockResolvedValue({ id: 'o1', status: 'confirmed' });
    prisma.invoice.findUnique.mockResolvedValue(null);
    prisma.invoice.create.mockResolvedValue({ id: 'i1', orderId: 'o1', amount: 12.5 });
    await expect(controller.postApiInvoices({ orderId: 'o1', amount: 12.5 })).resolves.toEqual({
      id: 'i1', orderId: 'o1', amount: 12.5,
    });
  });

  it('rejects unconfirmed orders', async () => {
    prisma.order.findUnique.mockResolvedValue({ id: 'o1', status: 'pending' });
    await expect(service.create({ orderId: 'o1', amount: 5 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns a downloadUrl for the order customer', async () => {
    prisma.invoice.findUnique.mockResolvedValue({
      id: 'i1', orderId: 'o1', amount: 1, order: { customer: { userId: 'u1' } },
    });
    const req = { session: { userId: 'u1', role: 'CUSTOMER', firmId: null } } as any;
    await expect(controller.getApiInvoicesIdDownload('i1', req)).resolves.toEqual({
      id: 'i1', downloadUrl: '/api/invoices/i1/file',
    });
  });

  it('forbids other customers', async () => {
    prisma.invoice.findUnique.mockResolvedValue({
      id: 'i1', orderId: 'o1', amount: 1, order: { customer: { userId: 'u1' } },
    });
    const req = { session: { userId: 'u2', role: 'CUSTOMER', firmId: null } } as any;
    await expect(controller.getApiInvoicesIdDownload('i1', req)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
