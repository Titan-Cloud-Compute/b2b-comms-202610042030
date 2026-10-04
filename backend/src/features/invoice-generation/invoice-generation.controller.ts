import { Body, Controller, Get, Header, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../../auth/roles.guard';
import { InvoiceGenerationService } from './invoice-generation.service';
import { PostApiInvoicesRequestDto } from './invoice-generation.dto';

@ApiTags('invoice-generation')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api/invoices')
export class InvoiceGenerationController {
  constructor(private readonly invoicegeneration: InvoiceGenerationService) {}

  @Post()
  @HttpCode(201)
  @Roles(UserRole.VENDOR)
  async postApiInvoices(@Body() body: PostApiInvoicesRequestDto) {
    return this.invoicegeneration.create(body);
  }

  @Get(':id/download')
  @Roles(UserRole.VENDOR, UserRole.CUSTOMER, UserRole.ADMIN)
  async getApiInvoicesIdDownload(@Param('id') id: string, @Req() req: Request) {
    return this.invoicegeneration.downloadLink(id, req.session);
  }

  @Get(':id/file')
  @Roles(UserRole.VENDOR, UserRole.CUSTOMER, UserRole.ADMIN)
  @Header('Content-Type', 'text/plain; charset=utf-8')
  async getApiInvoicesIdFile(@Param('id') id: string, @Req() req: Request) {
    return this.invoicegeneration.renderFile(id, req.session);
  }
}
