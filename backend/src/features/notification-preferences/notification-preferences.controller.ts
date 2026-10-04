import { BadRequestException, Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { NotificationPreferencesService } from './notification-preferences.service';
import {
  GetApiNotificationsPreferencesResponseDto,
  PutApiNotificationsPreferencesResponseDto,
} from './notification-preferences.dto';

/** Notification preferences are always scoped to the signed-in user (any role). */
@ApiTags('notification-preferences')
@UseGuards(JwtAuthGuard)
@Controller('api/notifications')
export class NotificationPreferencesController {
  constructor(private readonly notificationpreferences: NotificationPreferencesService) {}

  @Put('preferences')
  async putApiNotificationsPreferences(
    @Req() req: Request,
    @Body() body: unknown,
  ): Promise<PutApiNotificationsPreferencesResponseDto> {
    const b = (body ?? {}) as Record<string, unknown>;
    if (typeof b.orderAlerts !== 'boolean' || typeof b.messageAlerts !== 'boolean') {
      throw new BadRequestException('orderAlerts and messageAlerts must be booleans');
    }
    const { userId } = req.session!;
    return this.notificationpreferences.upsert(userId, {
      orderAlerts: b.orderAlerts,
      messageAlerts: b.messageAlerts,
    });
  }

  @Get('preferences')
  async getApiNotificationsPreferences(@Req() req: Request): Promise<GetApiNotificationsPreferencesResponseDto> {
    const { userId } = req.session!;
    return this.notificationpreferences.get(userId);
  }
}
