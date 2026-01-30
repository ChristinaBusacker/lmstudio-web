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
import { RenameFolder, DeleteFolder } from '../../core/state/folders/folders.actions';
import { MenuState, ContextMenuItem } from '../../ui/context-menu/context-menu.types';
import { ContextMenu } from '../../ui/context-menu/context-menu';
import { LocalizedTimeDirective } from '../../core/directives/localized-time/localized-time.directive';
import { Icon } from '../../ui/icon/icon';

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
            const newTitle = prompt('Renaming chat title', chat.title || '');
            if (newTitle) {
              this.store.dispatch(new RenameChat(id, newTitle));
            }
          }
        }
      },
    },
    {
      id: 'delete',
      label: 'Chat löschen',
      danger: true,
      action: (id) => {
        if (window.confirm('Do ypu want to delete the Chat?') && id) {
          this.store.dispatch(new DeleteChat(id));
          this.closeMenu();
        } else {
          this.closeMenu();
        }
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
        if (window.confirm('Do ypu want to delete the Folder?') && id) {
          this.store.dispatch(new DeleteFolder(id));
          this.closeMenu();
        } else {
          this.closeMenu();
        }
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
