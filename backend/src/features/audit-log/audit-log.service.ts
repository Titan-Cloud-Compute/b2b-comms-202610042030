import { BadRequestException, Injectable } from '@nestjs/common';
import { FeatureService } from '../../common/feature';
import { PrismaService } from '../../prisma/prisma.service';
import { PostApiAdminAuditLogRequestDto } from './audit-log.dto';

export interface AuditEntryView {
  id: string;
  action: string;
  userId: string;
  createdAt: string;
}

type AuditEntryRow = { id: string; action: string; userId: string; createdAt: Date };

function toView(row: AuditEntryRow): AuditEntryView {
  return {
    id: row.id,
    action: row.action,
    userId: row.userId,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class AuditLogService extends FeatureService {
  constructor(prisma: PrismaService) {
    super(prisma, ['AuditEntry'] as const);
  }

  /** All AuditEntry rows, oldest first (chronological order). */
  async list(): Promise<AuditEntryView[]> {
    const rows = await this.prisma.runAsAdmin((tx) =>
      tx.auditEntry.findMany({ orderBy: { createdAt: 'asc' } }),
    );
    return rows.map(toView);
  }

  /** Store a new AuditEntry and return the created record. */
  async create(body: PostApiAdminAuditLogRequestDto): Promise<AuditEntryView> {
    const action = typeof body?.action === 'string' ? body.action.trim() : '';
    const userId = typeof body?.userId === 'string' ? body.userId.trim() : '';
    if (!action) throw new BadRequestException('action is required');
    if (!userId) throw new BadRequestException('userId is required');
    const row = await this.prisma.runAsAdmin((tx) =>
      tx.auditEntry.create({ data: { action, userId } }),
    );
    return toView(row);
  }
}
