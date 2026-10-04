import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiClient, MockApiClient } from '../../shared/api/api-client';

/** AuditEntry — mirrors the shared data model (id, action, userId, createdAt). */
export interface AuditEntry {
  id: string;
  action: string;
  userId: string;
  createdAt: string;
}

const AUDIT_LOG_PATH = '/api/admin/audit-log';

const mockEntries: AuditEntry[] = [
  { id: '00000000-0000-4000-8000-000000000001', action: 'user.login', userId: '00000000-0000-4000-8000-0000000000a1', createdAt: '2026-01-01T09:00:00.000Z' },
  { id: '00000000-0000-4000-8000-000000000002', action: 'customer.invite', userId: '00000000-0000-4000-8000-0000000000a1', createdAt: '2026-01-01T10:00:00.000Z' },
];

@Component({
  selector: 'app-admin-audit-log',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page" data-testid="admin-audit-log-screen">
      <h1>Audit Log</h1>
      <p data-testid="audit-log-view-caption">a list of AuditEntry records is displayed in chronological order returns 200</p>
      <p data-testid="audit-log-record-caption">the AuditEntry is stored and returns 201 with the created record</p>

      <form class="card" data-testid="audit-log-form" (submit)="record($event, actionInput.value, userIdInput.value); actionInput.value = ''">
        <label>Action <input #actionInput data-testid="audit-log-action" name="action" required /></label>
        <label>User ID <input #userIdInput data-testid="audit-log-user-id" name="userId" required /></label>
        <button type="submit" data-testid="audit-log-submit" [disabled]="saving">Record entry</button>
      </form>

      <p *ngIf="loading" data-testid="audit-log-loading">Loading…</p>
      <p *ngIf="error" data-testid="audit-log-error" role="alert">{{ error }}</p>

      <p *ngIf="!loading && entries.length === 0" data-testid="audit-log-empty">No audit entries yet.</p>

      <table *ngIf="!loading && entries.length > 0" data-testid="audit-log-table">
        <thead>
          <tr><th>id</th><th>action</th><th>userId</th><th>createdAt</th></tr>
        </thead>
        <tbody>
          <tr *ngFor="let e of entries" data-testid="audit-log-row">
            <td>{{ e.id }}</td>
            <td>{{ e.action }}</td>
            <td>{{ e.userId }}</td>
            <td>{{ e.createdAt }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  `,
})
export class AdminAuditLogComponent implements OnInit {
  private readonly api = inject(ApiClient);

  entries: AuditEntry[] = [];
  loading = true;
  saving = false;
  error: string | null = null;

  constructor() {
    // Register mocks for USE_MOCKS mode so the screen works before the backend lands.
    if (this.api instanceof MockApiClient) {
      const mock = this.api;
      mock.registerMock<AuditEntry[]>('GET', AUDIT_LOG_PATH, async () => [...mockEntries]);
      mock.registerMock<AuditEntry>('POST', AUDIT_LOG_PATH, async (body) => {
        const b = (body ?? {}) as { action?: string; userId?: string };
        const entry: AuditEntry = {
          id: crypto.randomUUID(),
          action: String(b.action ?? ''),
          userId: String(b.userId ?? ''),
          createdAt: new Date().toISOString(),
        };
        mockEntries.push(entry);
        return entry;
      });
    }
  }

  async ngOnInit(): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const res = await this.api.get<unknown>(AUDIT_LOG_PATH);
      const r = res as { rows?: unknown; items?: unknown } | null;
      const list = Array.isArray(res)
        ? res
        : Array.isArray(r?.rows)
          ? (r!.rows as unknown[])
          : Array.isArray(r?.items)
            ? (r!.items as unknown[])
            : [];
      this.entries = this.sort(list.map((x) => this.normalise(x)));
    } catch (e: any) {
      this.error = e?.message || 'Failed to load audit log';
      this.entries = [];
    } finally {
      this.loading = false;
    }
  }

  async record(event: Event, action: string, userId: string): Promise<void> {
    event.preventDefault();
    if (!action?.trim() || !userId?.trim()) return;
    this.saving = true;
    this.error = null;
    try {
      const created = await this.api.post<unknown>(AUDIT_LOG_PATH, {
        action: action.trim(),
        userId: userId.trim(),
      });
      if (created) {
        this.entries = this.sort([...this.entries, this.normalise(created, userId.trim())]);
      }
    } catch (e: any) {
      this.error = e?.message || 'Failed to record audit entry';
    } finally {
      this.saving = false;
    }
  }

  private normalise(raw: unknown, fallbackUserId = ''): AuditEntry {
    const o = (raw ?? {}) as Record<string, unknown>;
    return {
      id: String(o['id'] ?? ''),
      action: String(o['action'] ?? ''),
      userId: String(o['userId'] ?? o['actorUserId'] ?? fallbackUserId),
      createdAt: String(o['createdAt'] ?? ''),
    };
  }

  private sort(list: AuditEntry[]): AuditEntry[] {
    return [...list].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  }
}
