import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiClient, ConflictError, MockApiClient } from '../../shared/api/api-client';

interface InviteCustomerResponse {
  customerId: string;
  email: string;
  invitationSent: boolean;
}

interface CustomerListItem {
  id: string;
  email: string;
}

const INVITE_PATH = '/api/admin/customers/invite';
const LIST_PATH = '/api/admin/customers';

/** Register in-memory handlers so the screen works against MockApiClient. */
function registerCustomerInviteMocks(client: MockApiClient): void {
  const store: CustomerListItem[] = [];
  client.registerMock<CustomerListItem[]>('GET', LIST_PATH, async () => store.map(c => ({ ...c })));
  client.registerMock<InviteCustomerResponse>('POST', INVITE_PATH, async (body) => {
    const email = String((body as { email?: string } | undefined)?.email ?? '').trim().toLowerCase();
    if (store.some(c => c.email === email)) {
      throw new ConflictError('Customer already exists');
    }
    const customer = { id: `mock-${store.length + 1}`, email };
    store.push(customer);
    return { customerId: customer.id, email, invitationSent: true };
  });
}

@Component({
  selector: 'app-admin-customers',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="page" data-testid="admin-customers-screen">
      <h1>Customer Management</h1>

      <section class="card">
        <h2>Invite a customer</h2>
        <form (ngSubmit)="invite()">
          <label for="invite-email">Customer email</label>
          <input
            id="invite-email"
            data-testid="invite-email"
            type="email"
            name="email"
            required
            [(ngModel)]="email"
          />
          <button type="submit" data-testid="invite-submit" [disabled]="sending()">Send invitation</button>
        </form>

        @if (result(); as r) {
          <p data-testid="invite-result">
            Invitation sent to {{ r.email }} (customer {{ r.customerId }}, invitationSent {{ r.invitationSent }}).
          </p>
        }
        @if (error(); as e) {
          <p data-testid="invite-error" role="alert">{{ e }}</p>
        }

        <ul data-testid="invite-outcomes">
          <li>On a new email, a Customer record is created and returns 201 with invitationSent true.</li>
          <li>On a repeated email, the response returns 409 error indicating the customer already exists.</li>
        </ul>
      </section>

      <section class="card">
        <h2>Customers</h2>
        <ul data-testid="customer-list">
          @for (c of customers(); track c.id) {
            <li data-testid="customer-row">{{ c.email }}</li>
          } @empty {
            <li>No customers yet.</li>
          }
        </ul>
      </section>
    </div>
  `,
})
export class AdminCustomersComponent implements OnInit {
  private readonly api = inject(ApiClient);

  email = '';
  readonly customers = signal<CustomerListItem[]>([]);
  readonly result = signal<InviteCustomerResponse | null>(null);
  readonly error = signal<string | null>(null);
  readonly sending = signal(false);

  constructor() {
    if (this.api instanceof MockApiClient) registerCustomerInviteMocks(this.api);
  }

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    try {
      const list = await this.api.get<CustomerListItem[]>(LIST_PATH);
      this.customers.set(Array.isArray(list) ? list : []);
    } catch {
      this.customers.set([]);
    }
  }

  async invite(): Promise<void> {
    const email = this.email.trim();
    if (!email) return;
    this.sending.set(true);
    this.error.set(null);
    this.result.set(null);
    try {
      const res = await this.api.post<InviteCustomerResponse>(INVITE_PATH, { email });
      this.result.set(res);
      this.email = '';
      await this.load();
    } catch (err) {
      this.error.set(
        err instanceof ConflictError || (err as { status?: number })?.status === 409
          ? 'A customer with this email already exists.'
          : 'Could not send the invitation. Please try again.',
      );
    } finally {
      this.sending.set(false);
    }
  }
}
