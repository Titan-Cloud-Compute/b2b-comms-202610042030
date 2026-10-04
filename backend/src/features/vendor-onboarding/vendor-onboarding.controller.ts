import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../../auth/roles.guard';
import { VendorOnboardingService } from './vendor-onboarding.service';
import type {
  PostApiVendorDocumentsRequestDto,
  PostApiVendorProfileRequestDto,
} from './vendor-onboarding.dto';

@ApiTags('vendor-onboarding')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.VENDOR)
@Controller('api/vendor')
export class VendorOnboardingController {
  constructor(private readonly vendoronboarding: VendorOnboardingService) {}

  private userId(req: Request): string {
    const id = req.session?.userId;
    if (!id) throw new UnauthorizedException();
    return id;
  }

  @Post('profile')
  @HttpCode(201)
  async postApiVendorProfile(@Req() req: Request, @Body() body: PostApiVendorProfileRequestDto) {
    return this.vendoronboarding.upsertProfile(this.userId(req), body);
  }

  @Post('documents')
  @HttpCode(201)
  async postApiVendorDocuments(@Req() req: Request, @Body() body: PostApiVendorDocumentsRequestDto) {
    return this.vendoronboarding.createDocument(this.userId(req), body);
  }

  @Get('documents')
  async getApiVendorDocuments(@Req() req: Request) {
    return this.vendoronboarding.listDocuments(this.userId(req));
  }
}
