import { Injectable } from '@nestjs/common';
import { FeatureService } from '../../common/feature';
import { PrismaService } from '../../prisma/prisma.service';
import {
  GetApiNotificationsPreferencesResponseDto,
  PutApiNotificationsPreferencesRequestDto,
  PutApiNotificationsPreferencesResponseDto,
} from './notification-preferences.dto';

@Injectable()
export class NotificationPreferencesService extends FeatureService {
  constructor(prisma: PrismaService) {
    super(prisma, ['NotificationPreference']);
  }

  async get(userId: string): Promise<GetApiNotificationsPreferencesResponseDto> {
    const row = await this.model('NotificationPreference').findUnique({ where: { userId } });
    if (!row) return { userId, orderAlerts: true, messageAlerts: true };
    return { userId: row.userId, orderAlerts: row.orderAlerts, messageAlerts: row.messageAlerts };
  }

  async upsert(
    userId: string,
    input: PutApiNotificationsPreferencesRequestDto,
  ): Promise<PutApiNotificationsPreferencesResponseDto> {
    const row = await this.model('NotificationPreference').upsert({
      where: { userId },
      create: { userId, orderAlerts: input.orderAlerts, messageAlerts: input.messageAlerts },
      update: { orderAlerts: input.orderAlerts, messageAlerts: input.messageAlerts },
    });
    return { userId: row.userId, orderAlerts: row.orderAlerts, messageAlerts: row.messageAlerts };
  }
}
