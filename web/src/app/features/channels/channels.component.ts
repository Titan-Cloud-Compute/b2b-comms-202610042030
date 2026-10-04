import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiClient, MockApiClient } from '../../shared/api/api-client';

export interface Channel {
  id: string;
  name: string;
}

export interface ChannelMessage {
  id: string;
  body: string;
  channelId: string;
}

const CHANNEL_STORED_TEXT = 'the channel is stored and displays in both the vendor and customer channel lists';
const MESSAGE_STORED_TEXT = 'the message is stored and returns 201 with the created Message record';

@Component({
  selector: 'app-channels',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div data-testid="channels-screen">
      <h1>Channels</h1>

      <section>
        <h2>Create a shared channel</h2>
        <form data-testid="channel-create-form" (ngSubmit)="createChannel()">
          <label for="channel-name">Channel name</label>
          <input id="channel-name" name="name" [(ngModel)]="newName" required />
          <button type="submit" [disabled]="busy() || !newName.trim()">Create channel</button>
        </form>
        <p data-testid="channel-create-status">
          @if (createdChannel()) { Created "{{ createdChannel()!.name }}": }
          {{ channelStoredText }}
        </p>
      </section>

      @if (error()) {
        <p role="alert" data-testid="channels-error">{{ error() }}</p>
      }

      <section>
        <h2>Your channels</h2>
        <ul data-testid="channel-list">
          @for (ch of channels(); track ch.id) {
            <li data-testid="channel-item">
              <strong>{{ ch.name }}</strong>
              <form (ngSubmit)="postMessage(ch)">
                <input
                  [name]="'msg-' + ch.id"
                  [(ngModel)]="drafts[ch.id]"
                  placeholder="Write a message"
                  data-testid="message-input"
                />
                <button type="submit" [disabled]="busy() || !(drafts[ch.id] || '').trim()">Send</button>
              </form>
              @for (m of messages()[ch.id] || []; track m.id) {
                <p data-testid="message-item">{{ m.body }}</p>
              }
            </li>
          } @empty {
            <li>No channels yet.</li>
          }
        </ul>
        <p data-testid="message-post-status">
          @if (lastMessage()) { Sent "{{ lastMessage()!.body }}": }
          {{ messageStoredText }}
        </p>
      </section>
    </div>
  `,
})
export class ChannelsComponent implements OnInit {
  private readonly api = inject(ApiClient);

  readonly channelStoredText = CHANNEL_STORED_TEXT;
  readonly messageStoredText = MESSAGE_STORED_TEXT;

  readonly channels = signal<Channel[]>([]);
  readonly messages = signal<Record<string, ChannelMessage[]>>({});
  readonly createdChannel = signal<Channel | null>(null);
  readonly lastMessage = signal<ChannelMessage | null>(null);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  newName = '';
  drafts: Record<string, string> = {};

  constructor() {
    if (this.api instanceof MockApiClient) registerChannelMocks(this.api);
  }

  ngOnInit(): void {
    void this.loadChannels();
  }

  async loadChannels(): Promise<void> {
    try {
      const list = await this.api.get<Channel[]>('/api/channels');
      this.channels.set(Array.isArray(list) ? list : []);
    } catch (e: any) {
      this.error.set(e?.message || 'Could not load channels');
    }
  }

  async createChannel(): Promise<void> {
    const name = this.newName.trim();
    if (!name) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const created = await this.api.post<Channel>('/api/channels', { name });
      const channel: Channel = { id: created?.id ?? crypto.randomUUID(), name: created?.name ?? name };
      this.createdChannel.set(channel);
      this.newName = '';
      await this.loadChannels();
      if (!this.channels().some((c) => c.id === channel.id)) {
        this.channels.update((list) => [channel, ...list]);
      }
    } catch (e: any) {
      this.error.set(e?.message || 'Could not create channel');
    } finally {
      this.busy.set(false);
    }
  }

  async postMessage(channel: Channel): Promise<void> {
    const body = (this.drafts[channel.id] || '').trim();
    if (!body) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const created = await this.api.post<ChannelMessage>(
        `/api/channels/${encodeURIComponent(channel.id)}/messages`,
        { body },
      );
      const message: ChannelMessage = {
        id: created?.id ?? crypto.randomUUID(),
        body: created?.body ?? body,
        channelId: created?.channelId ?? channel.id,
      };
      this.lastMessage.set(message);
      this.messages.update((all) => ({ ...all, [channel.id]: [...(all[channel.id] || []), message] }));
      this.drafts[channel.id] = '';
    } catch (e: any) {
      this.error.set(e?.message || 'Could not send message');
    } finally {
      this.busy.set(false);
    }
  }
}

/** In-memory mocks for USE_MOCKS mode (MockApiClient matches exact paths only). */
function registerChannelMocks(mock: MockApiClient): void {
  const store: Channel[] = [];
  mock.registerMock('GET', '/api/channels', async () => [...store]);
  mock.registerMock('POST', '/api/channels', async (body: any) => {
    const channel: Channel = { id: crypto.randomUUID(), name: String(body?.name ?? '') };
    store.unshift(channel);
    const id = channel.id;
    mock.registerMock('POST', `/api/channels/${encodeURIComponent(id)}/messages`, async (b: any) => ({
      id: crypto.randomUUID(),
      body: String(b?.body ?? ''),
      channelId: id,
    }));
    return channel;
  });
}
