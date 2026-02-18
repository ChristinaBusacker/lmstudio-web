import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { Store } from '@ngxs/store';
import { map } from 'rxjs';
import { SseService } from '../../core/sse/sse.service';
import { ChatsState } from '../../core/state/chats/chats.state';
import { FoldersState } from '../../core/state/folders/folders.state';
import { Composer } from '../../ui/composer/composer';
import { ChatCard } from '../../ui/chat-card/chat-card';
import { CommonModule } from '@angular/common';
import { RenameChat, DeleteChat } from '../../core/state/chats/chats.actions';
import { DeleteFolder, RenameFolder } from '../../core/state/folders/folders.actions';
import { MenuState, ContextMenuItem } from '../../ui/context-menu/context-menu.types';
import { ContextMenu } from '../../ui/context-menu/context-menu';
import { LocalizedTimeDirective } from '../../core/directives/localized-time/localized-time.directive';
import { Icon } from '../../ui/icon/icon';
import { DialogService } from '../../ui/dialog/dialog.service';
import { i18n } from '../../core/i18n/i18n.util';
import { I18nPipe } from '../../core/i18n/i18n.pipe';

@Component({
  selector: 'app-overview-page',
  imports: [CommonModule, Composer, ChatCard, ContextMenu, LocalizedTimeDirective, Icon, I18nPipe],
  templateUrl: './overview-page.html',
  styleUrl: './overview-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OverviewPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly store = inject(Store);
  private readonly sse = inject(SseService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog = inject(DialogService);
  chats$ = this.store.select(ChatsState.items).pipe(
    map((items) => {
      return items.filter((item) => item.folderId === null);
    }),
  );

  folders$ = this.store.select(FoldersState.items);

  readonly menu = signal<MenuState>({
    open: false,
    pos: { x: 0, y: 0 },
    chatId: null,
  });

  isChatMenu = true;

  readonly chatMenuItems: Array<ContextMenuItem<string | null>> = [
    {
      id: 'open',
      label: i18n('menu.chat.open'),
      action: async (id) => {
        await this.router.navigate(['/', 'chat', id]);
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
            closeLabel: null, // optional: keinen extra Close-Button
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

  readonly folderMenuItems: Array<ContextMenuItem<string | null>> = [
    {
      id: 'open',
      label: i18n('menu.folder.open'),
      action: async (id) => {
        await this.router.navigate(['/', 'folder', id]);
      },
    },
    {
      id: 'rename',
      label: i18n('menu.folder.rename'),
      action: (id) => {
        if (id) {
          const items = this.store.selectSnapshot(FoldersState.items);
          const folder = items.find((i) => i.id === id);
          if (folder) {
            const name = prompt(i18n('dialog.renameFolder.title'), folder.name || '');
            if (name) {
              this.store.dispatch(new RenameFolder(id, { name }));
            }
          }
        }
      },
    },
    {
      id: 'delete',
      label: i18n('menu.folder.delete'),
      danger: true,
      action: (id) => {
        if (!id) {
          this.closeMenu();
          return;
        }

        this.dialog
          .confirm({
            title: i18n('dialog.deleteFolder.title'),
            message: i18n('dialog.deleteFolder.message'),
            confirmLabel: i18n('common.delete'),
            declineLabel: i18n('common.cancel'),
            closeLabel: null,
          })
          .afterClosed()
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe((result) => {
            if (result.action === 'confirm') {
              this.store.dispatch(new DeleteFolder(id));
            }
            this.closeMenu();
          });
      },
    },
  ];

  openChatMenu(ev: MouseEvent, chatId: string): void {
    ev.preventDefault();
    ev.stopPropagation();

    this.isChatMenu = true;

    this.menu.set({
      open: true,
      pos: { x: ev.pageX, y: ev.pageY },
      chatId,
    });
  }

  openFolderMenu(ev: MouseEvent, fodlerId: string): void {
    ev.preventDefault();
    ev.stopPropagation();

    this.isChatMenu = false;

    this.menu.set({
      open: true,
      pos: { x: ev.pageX, y: ev.pageY },
      chatId: fodlerId,
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
