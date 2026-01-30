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
import { CubeInput } from '../cube-input/cube-input';
import { DialogService } from '../dialog/dialog.service';

@Component({
  selector: 'app-sidebar',
  imports: [CommonModule, Accordion, Icon, RouterLink, ContextMenu, DragDropModule, CubeInput],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
})
export class Sidebar {
  store = inject(Store);
  dialogService = inject(DialogService);
  chats$ = this.store.select(ChatsState.items).pipe(
    map((items) => {
      return items.filter((item) => item.folderId === null);
    }),
  );
  fodlers$ = this.store.select(FoldersState.items);

  private readonly dialog = inject(DialogService);

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
            closeLabel: null,
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
            this.dialog
              .prompt({
                title: 'Rename folder',
                placeholder: 'Enter folder name...',
                initialValue: folder.name || '',
                hint: 'Choose a descriptive name.',
                confirmLabel: 'Save',
                declineLabel: 'Cancel',
              })
              .afterClosed()
              .subscribe((result) => {
                if (result.action === 'confirm' && result.data) {
                  this.store.dispatch(new RenameFolder(id, { name: result.data }));
                }

                this.closeMenu();
              });
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
            title: 'Delete Folder',
            message: 'Do you want to delete the folder?',
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

  isChatMenu = true;

  @HostBinding('class.closed') @Input() closed = false;

  createNewChat() {
    this.store.dispatch(new CreateChat({ title: 'Untitled' }));
  }

  createNewFolder() {
    this.dialog
      .prompt({
        title: 'Folder name',
        placeholder: 'Enter folder...',
        initialValue: 'My Folder',
        hint: 'Choose a descriptive name.',
        confirmLabel: 'Save',
        declineLabel: 'Cancel',
      })
      .afterClosed()
      .subscribe((result) => {
        if (result.action === 'confirm' && result.data) {
          this.store.dispatch(new CreateFolder({ name: result.data }));
        }

        this.closeMenu();
      });
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

  openSearch(event: any) {
    this.dialogService.confirm({
      message: 'test',
    });
  }
}
