import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiClient, MockApiClient } from '../../shared/api/api-client';

interface VendorProfile {
  id: string;
  companyName: string;
  contactEmail: string;
}

interface VendorDocument {
  id: string;
  filename: string;
  status: string;
}

/** Register in-memory handlers so the screen works under MockApiClient. */
function registerVendorMocks(client: MockApiClient): void {
  const docs: VendorDocument[] = [];
  let seq = 0;
  const newId = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
  client.registerMock('POST', '/api/vendor/profile', async (body) => {
    const b = (body ?? {}) as Partial<VendorProfile>;
    return { id: newId(), companyName: b.companyName ?? '', contactEmail: b.contactEmail ?? '' };
  });
  client.registerMock('POST', '/api/vendor/documents', async (body) => {
    const b = (body ?? {}) as Partial<VendorDocument>;
    const doc: VendorDocument = { id: newId(), filename: b.filename ?? '', status: 'pending' };
    docs.push(doc);
    return doc;
  });
  client.registerMock('GET', '/api/vendor/documents', async () => [...docs]);
}

@Component({
  selector: 'app-vendor-profile',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div data-testid="vendor-profile-screen">
      <h1>Vendor Profile</h1>

      <section>
        <h2>Company profile</h2>
        <p>When you submit your company profile, the profile is stored and returns 201 with the created VendorProfile record.</p>
        <form data-testid="vendor-profile-form" (ngSubmit)="submitProfile()">
          <label>
            Company name
            <input data-testid="vendor-company-name" name="companyName" [(ngModel)]="companyName" required />
          </label>
          <label>
            Contact email
            <input data-testid="vendor-contact-email" name="contactEmail" type="email" [(ngModel)]="contactEmail" required />
          </label>
          <button type="submit" data-testid="vendor-profile-submit" [disabled]="saving()">Save profile</button>
        </form>
        @if (profile(); as p) {
          <p data-testid="vendor-profile-saved">Profile saved: {{ p.companyName }} ({{ p.contactEmail }})</p>
        }
      </section>

      <section>
        <h2>Compliance documents</h2>
        <form data-testid="vendor-document-upload" (ngSubmit)="uploadDocument()">
          <label>
            Filename
            <input data-testid="vendor-document-filename" name="filename" [(ngModel)]="filename" required />
          </label>
          <button type="submit" data-testid="vendor-document-submit" [disabled]="uploading()">Upload document</button>
        </form>

        <div data-testid="vendor-document-library">
          <h3>Document library</h3>
          <p>After you upload a compliance document, the document is stored with status "pending" and displays in the vendor document library.</p>
          @if (documents().length === 0) {
            <p>No documents uploaded yet.</p>
          } @else {
            <ul>
              @for (d of documents(); track d.id) {
                <li data-testid="vendor-document-item">{{ d.filename }} — {{ d.status }}</li>
              }
            </ul>
          }
        </div>
      </section>

      @if (error()) {
        <p role="alert" data-testid="vendor-profile-error">{{ error() }}</p>
      }
    </div>
  `,
})
export class VendorProfileComponent implements OnInit {
  private readonly api = inject(ApiClient);

  companyName = '';
  contactEmail = '';
  filename = '';

  readonly profile = signal<VendorProfile | null>(null);
  readonly documents = signal<VendorDocument[]>([]);
  readonly saving = signal(false);
  readonly uploading = signal(false);
  readonly error = signal<string | null>(null);

  constructor() {
    if (this.api instanceof MockApiClient) registerVendorMocks(this.api);
  }

  ngOnInit(): void {
    void this.loadDocuments();
  }

  async loadDocuments(): Promise<void> {
    try {
      const docs = await this.api.get<VendorDocument[]>('/api/vendor/documents');
      this.documents.set(Array.isArray(docs) ? docs : []);
    } catch {
      this.documents.set([]);
    }
  }

  async submitProfile(): Promise<void> {
    if (!this.companyName || !this.contactEmail) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      const p = await this.api.post<VendorProfile>('/api/vendor/profile', {
        companyName: this.companyName,
        contactEmail: this.contactEmail,
      });
      this.profile.set(p);
    } catch (e: any) {
      this.error.set(e?.message ?? 'Could not save profile');
    } finally {
      this.saving.set(false);
    }
  }

  async uploadDocument(): Promise<void> {
    if (!this.filename) return;
    this.uploading.set(true);
    this.error.set(null);
    try {
      await this.api.post<VendorDocument>('/api/vendor/documents', { filename: this.filename });
      this.filename = '';
      await this.loadDocuments();
    } catch (e: any) {
      this.error.set(e?.message ?? 'Could not upload document');
    } finally {
      this.uploading.set(false);
    }
  }
}
