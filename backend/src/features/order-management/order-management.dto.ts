// OrderManagement DTOs

export interface OrderItemDto {
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface PostApiOrdersRequestDto {
  vendorId: string;
  items?: OrderItemDto[];
}

export interface PostApiOrdersResponseDto {
  id: string;
  status: string;
  customerId: string;
}

export interface PatchApiOrdersIdConfirmRequestDto {
  estimatedDelivery: string;
}

export interface PatchApiOrdersIdConfirmResponseDto {
  id: string;
  status: string;
  estimatedDelivery?: string;
}

export interface GetApiOrdersRequestDto {}

export interface GetApiOrdersResponseDto {
  id: string;
  status: string;
  vendorId: string;
  customerId: string;
  createdAt: Date;
}
