import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
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

@ApiTags('order-management')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CUSTOMER, UserRole.VENDOR, UserRole.ADMIN)
@Controller('api/orders')
export class OrderManagementController {
  constructor(private readonly ordermanagement: OrderManagementService) {}

  @Post()
  @Roles(UserRole.CUSTOMER)
  @HttpCode(HttpStatus.CREATED)
  async postApiOrders(@Req() req: Request, @Body() body: PostApiOrdersRequestDto) {
    return this.ordermanagement.createOrder(req.session!.userId, body);
  }

  @Patch(':id/confirm')
  @Roles(UserRole.VENDOR)
  async patchApiOrdersIdConfirm(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: PatchApiOrdersIdConfirmRequestDto,
  ) {
    return this.ordermanagement.confirmOrder(req.session!.userId, id, body?.estimatedDelivery);
  }

  @Get()
  async getApiOrders(@Req() req: Request) {
    return this.ordermanagement.listOrders(req.session!);
  }
}
