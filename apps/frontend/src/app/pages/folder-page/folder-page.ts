import { CommonModule } from '@angular/common';
import {
  Component,
  DestroyRef,
  inject,
  OnInit,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { Store } from '@ngxs/store';
import { distinctUntilChanged, filter, map, Observable, of, tap } from 'rxjs';
import { ChatListItemDto } from '../../core/api/chats.api';
import { SseService } from '../../core/sse/sse.service';
import { ChatsState } from '../../core/state/chats/chats.state';
import { ChatFolderDto } from '../../core/api/folders.api';
import { FoldersState } from '../../core/state/folders/folders.state';
import { ChatCard } from '../../ui/chat-card/chat-card';
import { Composer } from '../../ui/composer/composer';
import { ContextMenuItem, MenuState } from '../../ui/context-menu/context-menu.types';
import { RenameChat, DeleteChat, MoveChat } from '../../core/state/chats/chats.actions';
import { ContextMenu } from '../../ui/context-menu/context-menu';
import { DialogService } from '../../ui/dialog/dialog.service';
import { i18n } from '../../core/i18n/i18n.util';

@Component({
  selector: 'app-folder-page',
  imports: [CommonModule, ChatCard, Composer, ContextMenu],
  templateUrl: './folder-page.html',
  styleUrl: './folder-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FolderPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly store = inject(Store);
  private readonly sse = inject(SseService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog = inject(DialogService);
  folderId = '';
  chats$: Observable<ChatListItemDto[]>;
  folder$: Observable<ChatFolderDto | null> = of(null);

  readonly menu = signal<MenuState>({
    open: false,
    pos: { x: 0, y: 0 },
    chatId: null,
  });

  readonly menuItems: Array<ContextMenuItem<string | null>> = [
    {
      id: 'open',
      label: i18n('menu.chat.open'),
      action: async (id) => {
        await this.router.navigate(['/', 'chat', id]);
      },
    },
    {
      id: 'moveOut',
      label: i18n('menu.chat.removeFromFolder'),
      action: (id) => {
        if (id) {
          this.store.dispatch(new MoveChat(id, null));
        }
      },
    },
    {
      id: 'rename',
      label: i18n('menu.chat.rename'),
      action: (id) => {
        if (id) {
          const items = this.store.selectSnapshot(ChatsState.items);
          const chat = items.find((i) => i.id === id);
          if (chat) {
            this.dialog
              .prompt({
                title: i18n('dialog.renameChat.title'),
                placeholder: i18n('dialog.renameChat.placeholder'),
                initialValue: chat.title || '',
                hint: i18n('dialog.renameChat.hint'),
                confirmLabel: i18n('common.save'),
                declineLabel: i18n('common.cancel'),
              })
              .afterClosed()
              .pipe(takeUntilDestroyed(this.destroyRef))
              .subscribe((result) => {
                if (result.action === 'confirm' && result.data) {
                  this.store.dispatch(new RenameChat(id, result.data));
                }

                this.closeMenu();
              });
          }
        }
      },
    },
    {
      id: 'delete',
      label: i18n('menu.chat.delete'),
      danger: true,
      action: (id) => {
        if (!id) {
          this.closeMenu();
          return;
        }

        this.dialog
          .confirm({
            title: i18n('dialog.deleteChat.title'),
            message: i18n('dialog.deleteChat.message'),
            confirmLabel: i18n('common.delete'),
            declineLabel: i18n('common.cancel'),
            closeLabel: null,
          })
          .afterClosed()
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe((result) => {
            if (result.action === 'confirm') {
              this.store.dispatch(new DeleteChat(id));
            }
            this.closeMenu();
          });
      },
    },
  ];

  ngOnInit(): void {
    this.route.paramMap
      .pipe(
        map((pm) => pm.get('folderId')),
        filter((id): id is string => !!id),
        distinctUntilChanged(),
        tap((folderId) => {
          this.folderId = folderId;
          this.chats$ = this.store.select(ChatsState.byFolder(folderId));
          this.folder$ = this.store.select(FoldersState.byId(folderId));
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  openMenu(ev: MouseEvent, chatId: string): void {
    ev.preventDefault();
    ev.stopPropagation();

    this.menu.set({
      open: true,
      pos: { x: ev.pageX, y: ev.pageY },
      chatId,
    });
  }

  closeMenu(): void {
    this.menu.set({
      open: false,
      pos: { x: 0, y: 0 },
      chatId: null,
    });
  }
}
