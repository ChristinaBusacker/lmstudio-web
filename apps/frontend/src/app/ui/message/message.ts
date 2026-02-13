import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Store } from '@ngxs/store';
import { MarkdownModule } from 'ngx-markdown';

import { ThreadMessageDto } from '../../core/api/chat-thread.api';
import { MessagesApi, MessageVariantDto } from '../../core/api/messages.api';
import {
  ActivateHead,
  LoadThread,
  RegenerateAssistantMessage,
} from '../../core/state/chat-detail/chat-detail.actions';
import { ContextMenu } from '../context-menu/context-menu';
import type { ContextMenuItem } from '../context-menu/context-menu.types';
import { DialogService } from '../dialog/dialog.service';
import { Icon } from '../icon/icon';

@Component({
  selector: 'app-message',
  imports: [CommonModule, FormsModule, MarkdownModule, ContextMenu, Icon],
  templateUrl: './message.html',
  styleUrl: './message.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Message {
  private readonly store = inject(Store);
  private readonly messagesApi = inject(MessagesApi);
  private readonly dialog = inject(DialogService);

  @Input() message!: ThreadMessageDto;

  /** Context menu state */
  readonly menu = signal<{ open: boolean; pos: { x: number; y: number } }>(
    { open: false, pos: { x: 0, y: 0 } },
  );

  /** Variants cache for this message (loaded lazily) */
  readonly variants = signal<MessageVariantDto[] | null>(null);

  readonly isEditing = signal(false);
  editContent = '';

  readonly hasMultipleVariants = computed(() => (this.message?.variantsCount ?? 0) > 1);
  readonly activeVariantIndex = computed(() => {
    const vars = this.variants();
    if (!vars) return this.message?.activeVariant?.variantIndex ?? 0;
    const active = vars.find((v) => v.isActive);
    return active?.variantIndex ?? this.message?.activeVariant?.variantIndex ?? 0;
  });

  readonly menuItems: Array<ContextMenuItem<ThreadMessageDto>> = [
    {
      id: 'branch',
      label: 'Branch from here',
      icon: 'flow-chart',
      action: (m) => this.branchFrom(m),
    },
    {
      id: 'regenerate',
      label: 'Regenerate',
      icon: 'refresh-line',
      hidden: (m) => m.role !== 'assistant',
      action: (m) => this.regenerate(m),
    },
    {
      id: 'edit',
      label: 'Edit',
      icon: 'pencil-line',
      disabled: (m) => !!m.deletedAt,
      action: (m) => this.startEdit(m),
    },
    {
      id: 'delete',
      label: 'Delete',
      icon: 'delete-bin-line',
      danger: true,
      disabled: (m) => !!m.deletedAt,
      action: (m) => this.deleteMessage(m),
    },
  ];

  openMenu(ev: MouseEvent): void {
    ev.preventDefault();
    ev.stopPropagation();
    this.menu.set({ open: true, pos: { x: ev.pageX, y: ev.pageY } });
  }

  closeMenu(): void {
    this.menu.set({ open: false, pos: { x: 0, y: 0 } });
  }

  async ensureVariantsLoaded(): Promise<void> {
    if (this.variants()) return;
    const messageId = this.message?.id;
    if (!messageId) return;

    this.messagesApi.listVariants(messageId).subscribe({
      next: (vars) => {
        const sorted = [...vars].sort((a, b) => a.variantIndex - b.variantIndex);
        this.variants.set(sorted);
      },
      error: (err) => console.error('[Message] listVariants failed', err),
    });
  }

  prevVariant(): void {
    this.switchVariant(-1);
  }

  nextVariant(): void {
    this.switchVariant(+1);
  }

  private switchVariant(delta: -1 | 1): void {
    void this.ensureVariantsLoaded();
    const vars = this.variants();
    if (!vars || vars.length === 0) return;

    const activeIdx = Math.max(
      0,
      vars.findIndex((v) => v.isActive),
    );
    const nextIdx = activeIdx + delta;
    if (nextIdx < 0 || nextIdx >= vars.length) return;

    const target = vars[nextIdx];
    if (!target) return;

    this.messagesApi.activateVariant(this.message.id, { variantId: target.id }).subscribe({
      next: () => {
        // optimistic local update
        const updated = vars.map((v) => ({ ...v, isActive: v.id === target.id }));
        this.variants.set(updated);
        this.store.dispatch(new LoadThread(this.message.chatId));
      },
      error: (err) => console.error('[Message] activateVariant failed', err),
    });
  }

  private regenerate(m: ThreadMessageDto): void {
    const clientRequestId = crypto.randomUUID();
    this.store.dispatch(new RegenerateAssistantMessage(m.id, { clientRequestId }));
  }

  private branchFrom(m: ThreadMessageDto): void {
    this.store.dispatch(new ActivateHead(m.chatId, m.id));
  }

  private startEdit(m: ThreadMessageDto): void {
    this.isEditing.set(true);
    this.editContent = m.activeVariant?.content ?? '';
  }

  cancelEdit(): void {
    this.isEditing.set(false);
    this.editContent = '';
  }

  saveEdit(): void {
    const content = (this.editContent ?? '').trim();
    if (!content) return;

    this.messagesApi.createVariant(this.message.id, { content }).subscribe({
      next: () => {
        this.isEditing.set(false);
        this.store.dispatch(new LoadThread(this.message.chatId));
      },
      error: (err) => console.error('[Message] saveEdit failed', err),
    });
  }

  private deleteMessage(m: ThreadMessageDto): void {
    this.dialog
      .confirm({
        title: 'Delete message',
        message: 'Do you want to delete this message?',
        confirmLabel: 'Delete',
        declineLabel: 'Cancel',
        closeLabel: null,
      })
      .afterClosed()
      .subscribe((res) => {
        if (res.action !== 'confirm') return;
        this.messagesApi.softDelete(m.id).subscribe({
          next: () => this.store.dispatch(new LoadThread(m.chatId)),
          error: (err) => console.error('[Message] deleteMessage failed', err),
        });
      });
  }
}
