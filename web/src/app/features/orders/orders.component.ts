import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiClient, MockApiClient } from '../../shared/api/api-client';

export interface OrderRow {
  id: string;
  status: string;
  customerId?: string;
  vendorId?: string;
  estimatedDelivery?: string;
}

interface ItemDraft {
  description: string;
  quantity: number;
  unitPrice: number;
}

/** In-memory mocks so the screen works under MockApiClient (USE_MOCKS). */
function registerOrderMocks(client: MockApiClient): void {
  const orders: OrderRow[] = [];
  let seq = 0;
  client.registerMock('GET', '/api/orders', async () => orders.map((o) => ({ ...o })));
  client.registerMock('POST', '/api/orders', async (body) => {
    const b = (body ?? {}) as { vendorId?: string };
    const o: OrderRow = { id: `mock-order-${++seq}`, status: 'pending', customerId: 'mock-customer', vendorId: b.vendorId };
    orders.unshift(o);
    return { ...o };
  });
  const origRequest = client.request.bind(client);
  client.request = (async (path: string, opts: any = {}) => {
    const m = /^\/api\/orders\/([^/]+)\/confirm$/.exec(path);
    if (m && (opts.method ?? 'GET').toUpperCase() === 'PATCH') {
      const o = orders.find((x) => x.id === m[1]);
      if (!o) throw new Error('order not found');
      o.status = 'confirmed';
      o.estimatedDelivery = opts.body?.estimatedDelivery;
      return { id: o.id, status: o.status };
    }
    return origRequest(path, opts);
  }) as MockApiClient['request'];
}

@Component({
  selector: 'app-orders',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div data-testid="orders-screen">
      <h1>Orders</h1>

      <section data-testid="orders-outcomes">
        <p data-testid="orders-outcome-created">
          When a customer submits a purchase order, the order is stored with status "pending" and returns 201 with the created Order record.
        </p>
        <p data-testid="orders-outcome-confirmed">
          When the vendor confirms it with an estimated delivery date, the order is updated to status "confirmed" and displays to the customer as confirmed.
        </p>
      </section>

      @if (error()) {
        <p data-testid="orders-error" role="alert">{{ error() }}</p>
      }
      @if (notice()) {
        <p data-testid="orders-notice">{{ notice() }}</p>
      }

      <section>
        <h2>Place a purchase order</h2>
        <form data-testid="order-create-form" (ngSubmit)="submitOrder()">
          <label>
            Vendor ID
            <input name="vendorId" data-testid="order-vendor-id" [(ngModel)]="vendorId" required />
          </label>
          @for (item of items; track $index) {
            <div data-testid="order-item-row">
              <input name="description{{ $index }}" placeholder="Description" [(ngModel)]="item.description" required />
              <input name="quantity{{ $index }}" type="number" min="1" [(ngModel)]="item.quantity" required />
              <input name="unitPrice{{ $index }}" type="number" min="0" step="0.01" [(ngModel)]="item.unitPrice" required />
              @if (items.length > 1) {
                <button type="button" (click)="removeItem($index)">Remove</button>
              }
            </div>
          }
          <button type="button" data-testid="order-add-item" (click)="addItem()">Add item</button>
          <button type="submit" data-testid="order-submit" [disabled]="busy()">Submit order</button>
        </form>
      </section>

      <section>
        <h2>Vendor queue</h2>
        <ul data-testid="vendor-queue">
          @for (o of pendingOrders(); track o.id) {
            <li data-testid="vendor-queue-item">
              <span>{{ o.id }} — {{ o.status }}</span>
              <input type="date" [attr.data-testid]="'order-eta-' + o.id" [(ngModel)]="eta[o.id]" name="eta-{{ o.id }}" />
              <button type="button" [attr.data-testid]="'order-confirm-' + o.id" [disabled]="busy() || !eta[o.id]" (click)="confirm(o)">Confirm</button>
            </li>
          } @empty {
            <li>No pending orders.</li>
          }
        </ul>
      </section>

      <section>
        <h2>Your orders</h2>
        <ul data-testid="order-list">
          @for (o of orders(); track o.id) {
            <li data-testid="order-row">{{ o.id }} — <strong data-testid="order-status">{{ o.status }}</strong></li>
          } @empty {
            <li>No orders yet.</li>
          }
        </ul>
      </section>
    </div>
  `,
})
export class OrdersComponent implements OnInit {
  private readonly api = inject(ApiClient);

  readonly orders = signal<OrderRow[]>([]);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly notice = signal<string | null>(null);

  vendorId = '';
  items: ItemDraft[] = [{ description: '', quantity: 1, unitPrice: 0 }];
  eta: Record<string, string> = {};

  constructor() {
    if (this.api instanceof MockApiClient) registerOrderMocks(this.api);
  }

  ngOnInit(): void {
    void this.load();
  }

  pendingOrders(): OrderRow[] {
    return this.orders().filter((o) => o.status === 'pending');
  }

  addItem(): void {
    this.items.push({ description: '', quantity: 1, unitPrice: 0 });
  }

  removeItem(i: number): void {
    this.items.splice(i, 1);
  }

  async load(): Promise<void> {
    try {
      const rows = await this.api.get<OrderRow[]>('/api/orders');
      this.orders.set(Array.isArray(rows) ? rows : []);
    } catch (e: any) {
      this.error.set(e?.message ?? 'Could not load orders');
    }
  }

  async submitOrder(): Promise<void> {
    this.error.set(null);
    this.notice.set(null);
    if (!this.vendorId.trim()) {
      this.error.set('Vendor ID is required');
      return;
    }
    this.busy.set(true);
    try {
      const created = await this.api.post<OrderRow>('/api/orders', {
        vendorId: this.vendorId.trim(),
        items: this.items.map((it) => ({
          description: it.description,
          quantity: Number(it.quantity),
          unitPrice: Number(it.unitPrice),
        })),
      });
      if (created?.id) {
        this.orders.update((list) => [created, ...list.filter((o) => o.id !== created.id)]);
        this.notice.set(`Order ${created.id} created with status "${created.status}"`);
      }
      this.vendorId = '';
      this.items = [{ description: '', quantity: 1, unitPrice: 0 }];
    } catch (e: any) {
      this.error.set(e?.message ?? 'Could not create order');
    } finally {
      this.busy.set(false);
    }
  }

  async confirm(order: OrderRow): Promise<void> {
    const estimatedDelivery = this.eta[order.id];
    if (!estimatedDelivery) return;
    this.error.set(null);
    this.busy.set(true);
    try {
      const res = await this.api.patch<OrderRow>(`/api/orders/${order.id}/confirm`, { estimatedDelivery });
      const status = res?.status ?? 'confirmed';
      this.orders.update((list) => list.map((o) => (o.id === order.id ? { ...o, status, estimatedDelivery } : o)));
      this.notice.set(`Order ${order.id} confirmed`);
    } catch (e: any) {
      this.error.set(e?.message ?? 'Could not confirm order');
    } finally {
      this.busy.set(false);
    }
  }
}
