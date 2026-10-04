import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { FeatureService } from '../../common/feature';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  GetApiChannelsResponseDto,
  PostApiChannelsIdMessagesResponseDto,
  PostApiChannelsResponseDto,
} from './shared-channel.dto';

@Injectable()
export class SharedChannelService extends FeatureService {
  constructor(prisma: PrismaService) {
    super(prisma, ['Channel', 'Message']);
  }

  async createChannel(userId: string, name: unknown): Promise<PostApiChannelsResponseDto> {
    if (typeof name !== 'string' || !name.trim()) {
      throw new BadRequestException('name is required');
    }
    const vendor = await this.prisma.vendorProfile.findUnique({ where: { userId } });
    if (!vendor) throw new ForbiddenException('only vendors can create channels');
    const channel = await this.prisma.channel.create({
      data: { name: name.trim(), vendorId: vendor.id, vendorProfileId: vendor.id },
    });
    return { id: channel.id, name: channel.name };
  }

  async listChannels(): Promise<GetApiChannelsResponseDto[]> {
    const channels = await this.prisma.channel.findMany({ orderBy: { createdAt: 'desc' } });
    return channels.map((c) => ({ id: c.id, name: c.name }));
  }

  async postMessage(
    userId: string,
    channelId: string,
    body: unknown,
  ): Promise<PostApiChannelsIdMessagesResponseDto> {
    if (typeof body !== 'string' || !body.trim()) {
      throw new BadRequestException('body is required');
    }
    const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) throw new NotFoundException('channel not found');
    const message = await this.prisma.message.create({
      data: { body: body.trim(), channelId, senderId: userId },
    });
    return { id: message.id, body: message.body, channelId: message.channelId };
  }
}
