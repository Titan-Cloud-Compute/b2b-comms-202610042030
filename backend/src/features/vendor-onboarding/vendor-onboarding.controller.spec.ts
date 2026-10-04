import 'reflect-metadata';
import { UnauthorizedException } from '@nestjs/common';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { VendorOnboardingController } from './vendor-onboarding.controller';
import { VendorOnboardingService } from './vendor-onboarding.service';
import { ROLES_KEY } from '../../auth/roles.guard';

function makePrisma() {
  const profiles: any[] = [];
  const docs: any[] = [];
  let n = 0;
  return {
    vendorProfile: {
      upsert: jest.fn(async ({ where, create, update }: any) => {
        const existing = profiles.find((p) => p.userId === where.userId);
        if (existing) return Object.assign(existing, update);
        const p = { id: `p${++n}`, ...create };
        profiles.push(p);
        return p;
      }),
      findUnique: jest.fn(async ({ where }: any) => profiles.find((p) => p.userId === where.userId) ?? null),
    },
    document: {
      create: jest.fn(async ({ data }: any) => {
        const d = { id: `d${++n}`, createdAt: new Date(), ...data };
        docs.push(d);
        return d;
      }),
      findMany: jest.fn(async ({ where }: any) => docs.filter((d) => d.vendorProfileId === where.vendorProfileId)),
    },
  };
}

const req = (userId?: string) => ({ session: userId ? { userId, role: 'VENDOR' } : undefined }) as any;

describe('VendorOnboardingController', () => {
  let controller: VendorOnboardingController;

  beforeEach(() => {
    const service = new VendorOnboardingService(makePrisma() as any);
    controller = new VendorOnboardingController(service);
  });

  it('is mounted at /api/vendor with profile and documents routes, VENDOR only', () => {
    expect(Reflect.getMetadata(PATH_METADATA, VendorOnboardingController)).toBe('api/vendor');
    const proto = VendorOnboardingController.prototype;
    expect(Reflect.getMetadata(PATH_METADATA, proto.postApiVendorProfile)).toBe('profile');
    expect(Reflect.getMetadata(METHOD_METADATA, proto.postApiVendorProfile)).toBe(RequestMethod.POST);
    expect(Reflect.getMetadata(PATH_METADATA, proto.postApiVendorDocuments)).toBe('documents');
    expect(Reflect.getMetadata(METHOD_METADATA, proto.getApiVendorDocuments)).toBe(RequestMethod.GET);
    expect(Reflect.getMetadata(ROLES_KEY, VendorOnboardingController)).toEqual(['VENDOR']);
  });

  it('stores the profile and returns the created VendorProfile record', async () => {
    const res = await controller.postApiVendorProfile(req('u1'), {
      companyName: 'Acme',
      contactEmail: 'ops@acme.example.com',
    });
    expect(res).toEqual({ id: expect.any(String), companyName: 'Acme', contactEmail: 'ops@acme.example.com' });
  });

  it('stores a document as pending and lists it only for its owner', async () => {
    await controller.postApiVendorProfile(req('u1'), { companyName: 'Acme', contactEmail: 'a@a.com' });
    const doc = await controller.postApiVendorDocuments(req('u1'), { filename: 'w9.pdf' });
    expect(doc).toEqual({ id: expect.any(String), filename: 'w9.pdf', status: 'pending' });
    expect(await controller.getApiVendorDocuments(req('u1'))).toEqual([doc]);
    expect(await controller.getApiVendorDocuments(req('u2'))).toEqual([]);
  });

  it('rejects document upload before a profile exists', async () => {
    await expect(controller.postApiVendorDocuments(req('u3'), { filename: 'x.pdf' })).rejects.toThrow();
  });

  it('rejects requests without a session', async () => {
    await expect(controller.getApiVendorDocuments(req())).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
