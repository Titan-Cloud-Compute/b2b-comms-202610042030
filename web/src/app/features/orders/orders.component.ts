import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiClient, MockApiClient } from '../../shared/api/api-client';

export interface Order {
  id: string;
  status: string;
  customerId?: string;
  vendorId?: string;
}

export interface OrderItem {
  description: string;
  quantity: number;
  unitPrice: number;
}

@Component({
  selector: 'app-orders',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div data-testid="orders-screen">
      <h1>Orders</h1>

      @if (error()) {
        <p role="alert" data-testid="order-error">{{ error() }}</p>
      }

      <section>
        <h2>Place a Purchase Order</h2>
        <form data-testid="order-create-form" (ngSubmit)="submitOrder()">
          <div>
            <label for="order-vendor-id">Vendor ID</label>
            <input
              id="order-vendor-id"
              name="vendorId"
              data-testid="order-vendor-id"
              [(ngModel)]="vendorId"
              required
            />
          </div>

          <h3>Items</h3>
          @for (item of items; track $index; let i = $index) {
            <div>
              <input
                [name]="'item-desc-' + i"
                [(ngModel)]="item.description"
                placeholder="Description"
              />
              <input
                [name]="'item-qty-' + i"
                [(ngModel)]="item.quantity"
                type="number"
                min="1"
                placeholder="Qty"
              />
              <input
                [name]="'item-price-' + i"
                [(ngModel)]="item.unitPrice"
                type="number"
                min="0"
                step="0.01"
                placeholder="Unit price"
              />
              <button type="button" (click)="removeItem(i)">Remove</button>
            </div>
          }
          <button type="button" (click)="addItem()">Add item</button>

          <div>
            <button type="submit" data-testid="order-submit" [disabled]="busy()">Submit Order</button>
          </div>
        </form>
      </section>

      <section>
        <h2>My Orders</h2>
        <ul data-testid="order-list">
          @for (order of orders(); track order.id) {
            <li data-testid="order-row">{{ order.id }} — {{ order.status }}</li>
          } @empty {
            <li>No orders yet.</li>
          }
        </ul>
      </section>

      <section>
        <h2>Vendor Queue</h2>
        <ul>
          @for (order of pendingOrders(); track order.id) {
            <li>
              <span>{{ order.id }}</span>
              <input
                [name]="'delivery-' + order.id"
                [(ngModel)]="deliveryDates[order.id]"
                type="date"
                data-testid="order-delivery-date"
              />
              <button
                data-testid="order-confirm"
                [disabled]="busy()"
                (click)="confirmOrder(order)"
              >Confirm</button>
            </li>
          } @empty {
            <li>No pending orders.</li>
          }
        </ul>
      </section>

      <section data-testid="order-lifecycle">
        <h2>How ordering works</h2>
        <p>When you submit a purchase order, the order is stored with status "pending" and returns 201 with the created Order record.</p>
        <p>When the vendor confirms it and sets an estimated delivery date, the order is updated to status "confirmed" and displays to the customer as confirmed.</p>
      </section>
    </div>
  `,
})
export class OrdersComponent implements OnInit {
  private readonly api = inject(ApiClient);

  readonly orders = signal<Order[]>([]);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  vendorId = '';
  items: OrderItem[] = [{ description: '', quantity: 1, unitPrice: 0 }];
  deliveryDates: Record<string, string> = {};

  constructor() {
    if (this.api instanceof MockApiClient) registerOrderMocks(this.api);
  }

  ngOnInit(): void {
    void this.loadOrders();
  }

  pendingOrders(): Order[] {
    return this.orders().filter(o => o.status === 'pending');
  }

  addItem(): void {
    this.items = [...this.items, { description: '', quantity: 1, unitPrice: 0 }];
  }

  removeItem(index: number): void {
    this.items = this.items.filter((_, i) => i !== index);
  }

  async loadOrders(): Promise<void> {
    try {
      const list = await this.api.get<Order[]>('/api/orders');
      this.orders.set(Array.isArray(list) ? list : []);
    } catch (e: any) {
      this.error.set(e?.message || 'Could not load orders');
    }
  }

  async submitOrder(): Promise<void> {
    const vendorId = this.vendorId.trim();
    if (!vendorId) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.api.post<Order>('/api/orders', { vendorId, items: this.items });
      this.vendorId = '';
      this.items = [{ description: '', quantity: 1, unitPrice: 0 }];
      await this.loadOrders();
    } catch (e: any) {
      this.error.set(e?.message || 'Could not place order');
    } finally {
      this.busy.set(false);
    }
  }

  async confirmOrder(order: Order): Promise<void> {
    const estimatedDelivery = this.deliveryDates[order.id] || '';
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.api.patch<Order>(`/api/orders/${encodeURIComponent(order.id)}/confirm`, { estimatedDelivery });
      delete this.deliveryDates[order.id];
      await this.loadOrders();
    } catch (e: any) {
      this.error.set(e?.message || 'Could not confirm order');
    } finally {
      this.busy.set(false);
    }
  }
}

/** In-memory mocks for USE_MOCKS mode. */
function registerOrderMocks(mock: MockApiClient): void {
  const store: Order[] = [];
  mock.registerMock('GET', '/api/orders', async () => [...store]);
  mock.registerMock('POST', '/api/orders', async (body: any) => {
    const order: Order = {
      id: crypto.randomUUID(),
      status: 'pending',
      customerId: '1',
      vendorId: String(body?.vendorId ?? ''),
    };
    store.push(order);
    mock.registerMock('PATCH', `/api/orders/${encodeURIComponent(order.id)}/confirm`, async (b: any) => {
      order.status = 'confirmed';
      return { ...order };
    });
    return order;
  });
}
