import { Body, Controller, Get, HttpCode, Param, Patch, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../../auth/roles.guard';
import { OrderManagementService } from './order-management.service';
import type {
  PatchApiOrdersIdConfirmRequestDto,
  PostApiOrdersRequestDto,
} from './order-management.dto';

function sessionOf(req: Request) {
  if (!req.session) throw new UnauthorizedException('not authenticated');
  return req.session;
}

@ApiTags('order-management')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api/orders')
export class OrderManagementController {
  constructor(private readonly ordermanagement: OrderManagementService) {}

  @Post()
  @HttpCode(201)
  @Roles(UserRole.CUSTOMER)
  async postApiOrders(@Req() req: Request, @Body() body: PostApiOrdersRequestDto) {
    return this.ordermanagement.create(sessionOf(req), body);
  }

  @Patch(':id/confirm')
  @Roles(UserRole.VENDOR, UserRole.ADMIN)
  async patchApiOrdersIdConfirm(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: PatchApiOrdersIdConfirmRequestDto,
  ) {
    return this.ordermanagement.confirm(sessionOf(req), id, body);
  }

  @Get()
  @Roles(UserRole.CUSTOMER, UserRole.VENDOR, UserRole.ADMIN)
  async getApiOrders(@Req() req: Request) {
    return this.ordermanagement.list(sessionOf(req));
  }
}
