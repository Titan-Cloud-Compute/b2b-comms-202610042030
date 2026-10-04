import { HttpStatus } from '@nestjs/common';
import { HTTP_CODE_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ROLES_KEY } from '../../auth/roles.guard';
import { SharedChannelController } from './shared-channel.controller';
import { SharedChannelService } from './shared-channel.service';

function makePrisma() {
  return {
    vendorProfile: { findUnique: jest.fn() },
    channel: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() },
    message: { create: jest.fn() },
  };
}

describe('SharedChannelController', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let controller: SharedChannelController;
  const req = (userId: string) => ({ session: { userId, email: 'x@y.z', role: 'VENDOR' } }) as any;

  beforeEach(() => {
    prisma = makePrisma();
    controller = new SharedChannelController(new SharedChannelService(prisma as any));
  });

  it('is mounted at api/channels', () => {
    expect(Reflect.getMetadata(PATH_METADATA, SharedChannelController)).toBe('api/channels');
    expect(Reflect.getMetadata(PATH_METADATA, SharedChannelController.prototype.postApiChannelsIdMessages)).toBe(':id/messages');
  });

  it('allows only vendors to create, vendors and customers otherwise', () => {
    expect(Reflect.getMetadata(ROLES_KEY, SharedChannelController.prototype.postApiChannels)).toEqual(['VENDOR']);
    expect(Reflect.getMetadata(ROLES_KEY, SharedChannelController)).toEqual(['VENDOR', 'CUSTOMER']);
  });

  it('creates a channel owned by the vendor profile', async () => {
    prisma.vendorProfile.findUnique.mockResolvedValue({ id: 'vp1' });
    prisma.channel.create.mockResolvedValue({ id: 'c1', name: 'General' });
    await expect(controller.postApiChannels(req('u1'), { name: 'General' })).resolves.toEqual({ id: 'c1', name: 'General' });
    expect(prisma.channel.create).toHaveBeenCalledWith({
      data: { name: 'General', vendorId: 'vp1', vendorProfileId: 'vp1' },
    });
  });

  it('lists channels', async () => {
    prisma.channel.findMany.mockResolvedValue([{ id: 'c1', name: 'General', vendorId: 'vp1' }]);
    await expect(controller.getApiChannels()).resolves.toEqual([{ id: 'c1', name: 'General' }]);
  });

  it('posts a message with 201 and the session user as sender', async () => {
    prisma.channel.findUnique.mockResolvedValue({ id: 'c1' });
    prisma.message.create.mockResolvedValue({ id: 'm1', body: 'hi', channelId: 'c1', senderId: 'u2' });
    await expect(controller.postApiChannelsIdMessages(req('u2'), 'c1', { body: 'hi' })).resolves.toEqual({
      id: 'm1', body: 'hi', channelId: 'c1',
    });
    expect(prisma.message.create).toHaveBeenCalledWith({ data: { body: 'hi', channelId: 'c1', senderId: 'u2' } });
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, SharedChannelController.prototype.postApiChannelsIdMessages)).toBe(HttpStatus.CREATED);
  });

  it('rejects a message for an unknown channel', async () => {
    prisma.channel.findUnique.mockResolvedValue(null);
    await expect(controller.postApiChannelsIdMessages(req('u2'), 'nope', { body: 'hi' })).rejects.toThrow('channel not found');
  });
});
