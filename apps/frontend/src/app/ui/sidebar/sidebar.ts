import { CommonModule } from '@angular/common';
import { Component, HostBinding, inject, Input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Store } from '@ngxs/store';
import { map } from 'rxjs';
import { ChatListItemDto } from '../../core/api/chats.api';
import { ChatFolderDto } from '../../core/api/folders.api';
import { DragDropModule } from '../../core/directives/drag-drop/drag-drop.module';
import { DropOnTargetResult } from '../../core/directives/drag-drop/drag-drop.types';
import { CreateChat, DeleteChat, MoveChat, RenameChat } from '../../core/state/chats/chats.actions';
import { ChatsState } from '../../core/state/chats/chats.state';
import { CreateFolder, DeleteFolder, RenameFolder } from '../../core/state/folders/folders.actions';
import { FoldersState } from '../../core/state/folders/folders.state';
import { Accordion } from '../accordion/accordion';
import { ContextMenu } from '../context-menu/context-menu';
import { ContextMenuItem, MenuState } from '../context-menu/context-menu.types';
import { Icon } from '../icon/icon';

@Component({
  selector: 'app-sidebar',
  imports: [CommonModule, Accordion, Icon, RouterLink, ContextMenu, DragDropModule],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
})
export class Sidebar {
  store = inject(Store);
  chats$ = this.store.select(ChatsState.items).pipe(
    map((items) => {
      return items.filter((item) => item.folderId === null);
    }),
  );
  fodlers$ = this.store.select(FoldersState.items);

  router = inject(Router);

  readonly menu = signal<MenuState>({
    open: false,
    pos: { x: 0, y: 0 },
    chatId: null,
  });

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

  isChatMenu = true;

  @HostBinding('class.closed') @Input() closed = false;

  createNewChat() {
    this.store.dispatch(new CreateChat({ title: 'Untitled' }));
  }

  createNewFolder() {
    const name = prompt('Enter a Folder name', 'Folder');
    if (name) {
      this.store.dispatch(new CreateFolder({ name }));
    }
  }

  onChatDroppedIntoFolder(a: DropOnTargetResult<ChatListItemDto, ChatFolderDto>) {
    const chat = a.item;
    const folder = a.target.data;

    this.store.dispatch(new MoveChat(chat.id, folder.id));
  }

  onChatReorder(a: any) {
    //
  }

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
