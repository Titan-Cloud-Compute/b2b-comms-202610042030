import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiClient, MockApiClient } from '../../shared/api/api-client';

// Contract types (POST /api/invoices, GET /api/invoices/:id/download).
// Declared locally: shared/contracts is not editable from this card.
export interface CreateInvoiceRequest {
  orderId: string;
  amount: number;
}
export interface InvoiceResponse {
  id: string;
  orderId: string;
  amount: number;
}
export interface InvoiceDownloadResponse {
  id: string;
  downloadUrl: string;
}

function registerInvoiceMocks(api: ApiClient): void {
  if (!(api instanceof MockApiClient)) return;
  api.registerMock<InvoiceResponse>('POST', '/api/invoices', async (body) => {
    const b = (body ?? {}) as Partial<CreateInvoiceRequest>;
    return { id: 'mock-invoice-1', orderId: String(b.orderId ?? ''), amount: Number(b.amount ?? 0) };
  });
}

@Component({
  selector: 'app-invoices',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div data-testid="invoices-screen">
      <h1>Invoices</h1>

      <section>
        <h2>Generate invoice</h2>
        <p>When a vendor generates an invoice for a confirmed order, the invoice is created and returns 201 with the invoice id available for download.</p>
        <form (ngSubmit)="generate()">
          <label>Order id
            <input data-testid="invoice-order-id" name="orderId" [(ngModel)]="orderId" required />
          </label>
          <label>Amount
            <input data-testid="invoice-amount" name="amount" type="number" step="0.01" min="0" [(ngModel)]="amount" required />
          </label>
          <button type="submit" data-testid="invoice-generate">Generate invoice</button>
        </form>
        @if (created) {
          <p data-testid="invoice-created">Invoice created: <strong data-testid="invoice-created-id">{{ created.id }}</strong></p>
        }
        @if (generateError) {
          <p role="alert" data-testid="invoice-generate-error">{{ generateError }}</p>
        }
      </section>

      <section>
        <h2>Download invoice</h2>
        <p>When the customer requests the invoice download link, the response returns 200 with a downloadUrl pointing to the stored invoice.</p>
        <form (ngSubmit)="download()">
          <label>Invoice id
            <input data-testid="invoice-download-id" name="invoiceId" [(ngModel)]="invoiceId" required />
          </label>
          <button type="submit" data-testid="invoice-download">Get download link</button>
        </form>
        @if (downloadUrl) {
          <p data-testid="invoice-download-url"><a [href]="downloadUrl" target="_blank" rel="noopener">{{ downloadUrl }}</a></p>
        }
        @if (downloadError) {
          <p role="alert" data-testid="invoice-download-error">{{ downloadError }}</p>
        }
      </section>
    </div>
  `,
})
export class InvoicesComponent {
  private readonly api = inject(ApiClient);

  orderId = '';
  amount: number | null = null;
  invoiceId = '';
  created: InvoiceResponse | null = null;
  downloadUrl = '';
  generateError = '';
  downloadError = '';

  constructor() {
    registerInvoiceMocks(this.api);
  }

  async generate(): Promise<void> {
    this.generateError = '';
    this.created = null;
    const body: CreateInvoiceRequest = { orderId: this.orderId.trim(), amount: Number(this.amount) };
    if (!body.orderId || !Number.isFinite(body.amount) || body.amount <= 0) {
      this.generateError = 'Enter an order id and a positive amount.';
      return;
    }
    try {
      this.created = await this.api.post<InvoiceResponse>('/api/invoices', body);
      this.invoiceId = this.created.id;
    } catch (e: any) {
      this.generateError = e?.message || 'Could not generate invoice.';
    }
  }

  async download(): Promise<void> {
    this.downloadError = '';
    this.downloadUrl = '';
    const id = this.invoiceId.trim();
    if (!id) {
      this.downloadError = 'Enter an invoice id.';
      return;
    }
    const path = `/api/invoices/${encodeURIComponent(id)}/download`;
    if (this.api instanceof MockApiClient) {
      this.api.registerMock<InvoiceDownloadResponse>('GET', path, async () => ({
        id,
        downloadUrl: `/api/invoices/${encodeURIComponent(id)}/file`,
      }));
    }
    try {
      const res = await this.api.get<InvoiceDownloadResponse>(path);
      this.downloadUrl = res.downloadUrl;
    } catch (e: any) {
      this.downloadError = e?.message || 'Could not get download link.';
    }
  }
}
