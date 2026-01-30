import { Component, DestroyRef, inject, signal } from '@angular/core';
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

@Component({
  selector: 'app-overview-page',
  imports: [CommonModule, Composer, ChatCard, ContextMenu, LocalizedTimeDirective, Icon],
  templateUrl: './overview-page.html',
  styleUrl: './overview-page.scss',
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
      label: 'Chat öffnen',
      action: (id) => {
        this.router.navigate(['/', 'chat', id]);
      },
    },
    {
      id: 'rename',
      label: 'Chat umbenennen',
      action: (id) => {
        if (id) {
          const items = this.store.selectSnapshot(ChatsState.items);
          const chat = items.find((i) => i.id === id);
          if (chat) {
            this.dialog
              .prompt({
                title: 'Chat title',
                placeholder: 'Enter chat title...',
                initialValue: chat.title || '',
                hint: 'Choose a descriptive title.',
                confirmLabel: 'Save',
                declineLabel: 'Cancel',
              })
              .afterClosed()
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
      label: 'Chat löschen',
      danger: true,
      action: (id) => {
        if (!id) {
          this.closeMenu();
          return;
        }

        this.dialog
          .confirm({
            title: 'Delete chat',
            message: 'Do you want to delete the chat?',
            confirmLabel: 'Delete',
            declineLabel: 'Cancel',
            closeLabel: null, // optional: keinen extra Close-Button
          })
          .afterClosed()
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
      label: 'Ordner öffnen',
      action: (id) => {
        this.router.navigate(['/', 'folder', id]);
      },
    },
    {
      id: 'rename',
      label: 'Ordner umbenennen',
      action: (id) => {
        if (id) {
          const items = this.store.selectSnapshot(FoldersState.items);
          const folder = items.find((i) => i.id === id);
          if (folder) {
            const name = prompt('Renaming fodler title', folder.name || '');
            if (name) {
              this.store.dispatch(new RenameFolder(id, { name }));
            }
          }
        }
      },
    },
    {
      id: 'delete',
      label: 'Ordner löschen',
      danger: true,
      action: (id) => {
        if (!id) {
          this.closeMenu();
          return;
        }

        this.dialog
          .confirm({
            title: 'Delete chat',
            message: 'Do you want to delete the chat?',
            confirmLabel: 'Delete',
            declineLabel: 'Cancel',
            closeLabel: null,
          })
          .afterClosed()
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
