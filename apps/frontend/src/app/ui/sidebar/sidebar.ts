import { CommonModule } from '@angular/common';
import {
  Component,
  HostBinding,
  inject,
  Input,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
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
import { WorkflowsState } from '../../core/state/workflows/workflow.state';
import { Accordion } from '../accordion/accordion';
import { ContextMenu } from '../context-menu/context-menu';
import { ContextMenuItem, MenuState } from '../context-menu/context-menu.types';
import { DialogService } from '../dialog/dialog.service';
import { i18n } from '../../core/i18n/i18n.util';
import { Icon } from '../icon/icon';
import { I18nPipe } from '../../core/i18n/i18n.pipe';
import {
  CreateWorkflow,
  DeleteWorkflow,
  UpdateWorkflow,
} from '../../core/state/workflows/workflow.actions';
import { SystemState } from '../../core/state/system/system.state';
import type { ExternalServiceStatus } from '../../core/state/system/system.models';

@Component({
  selector: 'app-sidebar',
  imports: [CommonModule, Accordion, Icon, RouterLink, ContextMenu, DragDropModule, I18nPipe],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Sidebar {
  store = inject(Store);
  dialogService = inject(DialogService);
  chats$ = this.store.select(ChatsState.items).pipe(
    map((items) => {
      return items.filter((item) => item.folderId === null);
    }),
  );
  readonly fodlers$ = this.store.select(FoldersState.items);
  readonly workflows$ = this.store.select(WorkflowsState.workflows);

  readonly external$ = this.store.select(SystemState.external);

  private readonly dialog = inject(DialogService);

  router = inject(Router);

  externalStatusDot(status: ExternalServiceStatus | null): 'ok' | 'warn' | 'bad' {
    if (!status) return 'warn'; // no snapshot yet
    if (!status.enabled) return 'warn';
    return status.ok ? 'ok' : 'bad';
  }

  readonly menu = signal<MenuState>({
    open: false,
    pos: { x: 0, y: 0 },
    chatId: null,
  });

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
                title: 'Chat title',
                placeholder: i18n('dialog.renameChat.placeholder'),
                initialValue: chat.title || '',
                hint: i18n('dialog.renameChat.hint'),
                confirmLabel: i18n('common.save'),
                declineLabel: i18n('common.cancel'),
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
            this.dialog
              .prompt({
                title: i18n('dialog.renameFolder.title'),
                placeholder: i18n('dialog.renameFolder.placeholder'),
                initialValue: folder.name || '',
                hint: i18n('dialog.renameWorkflow.hint'),
                confirmLabel: i18n('common.save'),
                declineLabel: i18n('common.cancel'),
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
      label: i18n('menu.folder.delete'),
      danger: true,
      action: (id) => {
        if (!id) {
          this.closeMenu();
          return;
        }

        this.dialog
          .confirm({
            title: 'Delete Folder',
            message: i18n('dialog.deleteFolder.message'),
            confirmLabel: i18n('common.delete'),
            declineLabel: i18n('common.cancel'),
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

  readonly workflowMenuItems: Array<ContextMenuItem<string | null>> = [
    {
      id: 'open',
      label: i18n('menu.workflow.open'),
      action: async (id) => {
        await this.router.navigate(['/', 'workflow', id]);
      },
    },
    {
      id: 'rename',
      label: i18n('menu.workflow.rename'),
      action: (id) => {
        if (id) {
          const items = this.store.selectSnapshot(WorkflowsState.workflows);
          const workflow = items.find((i) => i.id === id);
          if (workflow) {
            this.dialog
              .prompt({
                title: i18n('dialog.renameWorkflow.title'),
                placeholder: i18n('dialog.renameWorkflow.placeholder'),
                initialValue: workflow.name || '',
                hint: i18n('dialog.renameWorkflow.hint'),
                confirmLabel: i18n('common.save'),
                declineLabel: i18n('common.cancel'),
              })
              .afterClosed()
              .subscribe((result) => {
                if (result.action === 'confirm' && result.data) {
                  this.store.dispatch(new UpdateWorkflow(id, { name: result.data }));
                }

                this.closeMenu();
              });
          }
        }
      },
    },
    {
      id: 'delete',
      label: i18n('menu.workflow.delete'),
      danger: true,
      action: (id) => {
        if (!id) {
          this.closeMenu();
          return;
        }

        this.dialog
          .confirm({
            title: i18n('dialog.deleteWorkflow.title'),
            message: i18n('dialog.deleteWorkflow.message'),
            confirmLabel: i18n('common.delete'),
            declineLabel: i18n('common.cancel'),
            closeLabel: null,
          })
          .afterClosed()
          .subscribe((result) => {
            if (result.action === 'confirm') {
              this.store.dispatch(new DeleteWorkflow(id));
            }
            this.closeMenu();
          });
      },
    },
  ];

  menuType: 'chat' | 'folder' | 'workflow';

  isChatMenu = true;

  @HostBinding('class.closed') @Input() closed = false;

  createNewChat(): void {
    this.store.dispatch(new CreateChat({ title: 'Untitled' }));
  }

  createNewWorkflow(): void {
    this.dialog
      .prompt({
        title: 'Workflow name',
        placeholder: 'Enter workflow name',
        initialValue: 'New workflow',
        hint: i18n('dialog.renameWorkflow.hint'),
        confirmLabel: i18n('common.save'),
        declineLabel: i18n('common.cancel'),
      })
      .afterClosed()
      .subscribe((result) => {
        if (result.action === 'confirm' && result.data) {
          this.store.dispatch(
            new CreateWorkflow({ name: result.data, graph: { nodes: [], edges: [] } }),
          );
        }

        this.closeMenu();
      });
  }

  createNewFolder(): void {
    this.dialog
      .prompt({
        title: 'Folder name',
        placeholder: 'Enter folder...',
        initialValue: 'My Folder',
        hint: i18n('dialog.renameWorkflow.hint'),
        confirmLabel: i18n('common.save'),
        declineLabel: i18n('common.cancel'),
      })
      .afterClosed()
      .subscribe((result) => {
        if (result.action === 'confirm' && result.data) {
          this.store.dispatch(new CreateFolder({ name: result.data }));
        }

        this.closeMenu();
      });
  }

  onChatDroppedIntoFolder(a: DropOnTargetResult<ChatListItemDto, ChatFolderDto>): void {
    const chat = a.item;
    const folder = a.target.data;

    this.store.dispatch(new MoveChat(chat.id, folder.id));
  }

  onChatReorder(a: unknown): void {
    console.log(a);
  }

  openChatMenu(ev: MouseEvent, chatId: string): void {
    ev.preventDefault();
    ev.stopPropagation();

    this.menuType = 'chat';

    this.menu.set({
      open: true,
      pos: { x: ev.pageX, y: ev.pageY },
      chatId,
    });
  }

  openWorkflowMenu(ev: MouseEvent, workflowId: string): void {
    ev.preventDefault();
    ev.stopPropagation();

    this.menuType = 'workflow';

    this.menu.set({
      open: true,
      pos: { x: ev.pageX, y: ev.pageY },
      chatId: workflowId,
    });
  }

  openFolderMenu(ev: MouseEvent, fodlerId: string): void {
    ev.preventDefault();
    ev.stopPropagation();

    this.menuType = 'folder';

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

  openSearch(): void {
    this.dialogService.search({
      placeholder: 'Search for chats',
    });
  }
}
