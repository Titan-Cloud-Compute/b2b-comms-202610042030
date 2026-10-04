import { BadRequestException } from '@nestjs/common';
import { NotificationPreferencesController } from './notification-preferences.controller';
import { NotificationPreferencesService } from './notification-preferences.service';

function makeController() {
  const store = new Map<string, { userId: string; orderAlerts: boolean; messageAlerts: boolean }>();
  const prisma = {
    notificationPreference: {
      findUnique: jest.fn(async ({ where }: any) => store.get(where.userId) ?? null),
      upsert: jest.fn(async ({ where, create, update }: any) => {
        const existing = store.get(where.userId);
        const row = existing ? { ...existing, ...update } : { ...create };
        store.set(where.userId, row);
        return { id: 'np-1', ...row };
      }),
    },
  };
  const service = new NotificationPreferencesService(prisma as any);
  return { controller: new NotificationPreferencesController(service), prisma, store };
}

const req = (userId: string) => ({ session: { userId, email: 'u@x', role: 'USER' } }) as any;

describe('NotificationPreferencesController', () => {
  it('stores preferences for the signed-in user and returns the record', async () => {
    const { controller, prisma } = makeController();
    const res = await controller.putApiNotificationsPreferences(req('user-1'), {
      orderAlerts: true,
      messageAlerts: false,
    });
    expect(res).toEqual({ userId: 'user-1', orderAlerts: true, messageAlerts: false });
    expect(prisma.notificationPreference.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' } }),
    );
    await expect(controller.getApiNotificationsPreferences(req('user-1'))).resolves.toEqual(res);
  });

  it('stores both alert fields as false when the user disables all notifications', async () => {
    const { controller, store } = makeController();
    await controller.putApiNotificationsPreferences(req('user-2'), { orderAlerts: true, messageAlerts: true });
    const res = await controller.putApiNotificationsPreferences(req('user-2'), {
      orderAlerts: false,
      messageAlerts: false,
    });
    expect(res).toEqual({ userId: 'user-2', orderAlerts: false, messageAlerts: false });
    expect(store.get('user-2')).toMatchObject({ orderAlerts: false, messageAlerts: false });
  });

  it('scopes reads to the signed-in user', async () => {
    const { controller } = makeController();
    await controller.putApiNotificationsPreferences(req('a'), { orderAlerts: false, messageAlerts: false });
    await expect(controller.getApiNotificationsPreferences(req('b'))).resolves.toEqual({
      userId: 'b',
      orderAlerts: true,
      messageAlerts: true,
    });
  });

  it('rejects non-boolean fields', async () => {
    const { controller } = makeController();
    await expect(
      controller.putApiNotificationsPreferences(req('a'), { orderAlerts: 'yes', messageAlerts: false }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
