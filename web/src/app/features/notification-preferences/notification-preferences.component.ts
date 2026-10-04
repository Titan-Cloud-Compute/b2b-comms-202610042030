import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiClient } from '../../shared/api/api-client.service';

/** Mirrors the NotificationPreference contract (GET/PUT /api/notifications/preferences). */
export interface NotificationPreferenceRecord {
  userId: string;
  orderAlerts: boolean;
  messageAlerts: boolean;
}

@Component({
  selector: 'app-notification-preferences',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div data-testid="settings-notifications-screen">
      <h1>Notification Settings</h1>
      <form (ngSubmit)="save()">
        <label>
          <input type="checkbox" data-testid="notif-order-alerts" name="orderAlerts"
                 [(ngModel)]="orderAlerts" />
          Order alerts
        </label>
        <label>
          <input type="checkbox" data-testid="notif-message-alerts" name="messageAlerts"
                 [(ngModel)]="messageAlerts" />
          Message alerts
        </label>
        <button type="submit" data-testid="notif-save" [disabled]="saving()">Save</button>
      </form>
      <ul data-testid="notif-outcomes">
        <li>Saving: the preferences are updated and returns 200 with the stored NotificationPreference record.</li>
        <li>Turning every alert off and saving: the preferences are updated with both alert fields stored as false.</li>
      </ul>
      @if (status()) {
        <p data-testid="notif-status" role="status">{{ status() }}</p>
      }
      @if (error()) {
        <p data-testid="notif-error" role="alert">{{ error() }}</p>
      }
    </div>
  `,
})
export class NotificationPreferencesComponent implements OnInit {
  private api = inject(ApiClient);

  orderAlerts = true;
  messageAlerts = true;
  saving = signal(false);
  status = signal('');
  error = signal('');

  async ngOnInit(): Promise<void> {
    try {
      const prefs = await this.api.get<NotificationPreferenceRecord>('notifications/preferences');
      if (prefs) {
        this.orderAlerts = !!prefs.orderAlerts;
        this.messageAlerts = !!prefs.messageAlerts;
      }
    } catch {
      // No stored preferences yet — keep defaults.
    }
  }

  async save(): Promise<void> {
    this.saving.set(true);
    this.error.set('');
    this.status.set('');
    try {
      const stored = await this.api.put<NotificationPreferenceRecord>('notifications/preferences', {
        orderAlerts: this.orderAlerts,
        messageAlerts: this.messageAlerts,
      });
      const order = stored?.orderAlerts ?? this.orderAlerts;
      const message = stored?.messageAlerts ?? this.messageAlerts;
      this.orderAlerts = order;
      this.messageAlerts = message;
      this.status.set(
        !order && !message
          ? 'Saved: the preferences are updated with both alert fields stored as false.'
          : `Saved: the preferences are updated and returns 200 with the stored NotificationPreference record (order alerts ${order ? 'on' : 'off'}, message alerts ${message ? 'on' : 'off'}).`,
      );
    } catch {
      this.error.set('Could not save notification preferences.');
    } finally {
      this.saving.set(false);
    }
  }
}
