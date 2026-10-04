import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { FeatureService } from '../../common/feature';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  PostApiVendorDocumentsRequestDto,
  PostApiVendorDocumentsResponseDto,
  GetApiVendorDocumentsResponseDto,
  PostApiVendorProfileRequestDto,
  PostApiVendorProfileResponseDto,
} from './vendor-onboarding.dto';

@Injectable()
export class VendorOnboardingService extends FeatureService {
  constructor(prisma: PrismaService) {
    super(prisma, ['VendorProfile', 'Document'] as const);
  }

  /** Create or update the caller's own vendor profile (keyed by session userId). */
  async upsertProfile(
    userId: string,
    dto: PostApiVendorProfileRequestDto,
  ): Promise<PostApiVendorProfileResponseDto> {
    const companyName = typeof dto?.companyName === 'string' ? dto.companyName.trim() : '';
    const contactEmail = typeof dto?.contactEmail === 'string' ? dto.contactEmail.trim() : '';
    if (!companyName || !contactEmail) {
      throw new BadRequestException('companyName and contactEmail are required');
    }
    const p = await this.model('VendorProfile').upsert({
      where: { userId },
      create: { userId, companyName, contactEmail },
      update: { companyName, contactEmail },
    });
    return { id: p.id, companyName: p.companyName, contactEmail: p.contactEmail };
  }

  /** Store a compliance document with status "pending" against the caller's profile. */
  async createDocument(
    userId: string,
    dto: PostApiVendorDocumentsRequestDto,
  ): Promise<PostApiVendorDocumentsResponseDto> {
    const filename = typeof dto?.filename === 'string' ? dto.filename.trim() : '';
    if (!filename) throw new BadRequestException('filename is required');
    const profile = await this.model('VendorProfile').findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Submit your vendor profile first');
    const d = await this.model('Document').create({
      data: { filename, status: 'pending', vendorProfileId: profile.id },
    });
    return { id: d.id, filename: d.filename, status: d.status };
  }

  /** List only the caller's own documents. */
  async listDocuments(userId: string): Promise<GetApiVendorDocumentsResponseDto[]> {
    const profile = await this.model('VendorProfile').findUnique({ where: { userId } });
    if (!profile) return [];
    const docs = await this.model('Document').findMany({
      where: { vendorProfileId: profile.id },
      orderBy: { createdAt: 'asc' },
    });
    return docs.map((d) => ({ id: d.id, filename: d.filename, status: d.status }));
  }
}
