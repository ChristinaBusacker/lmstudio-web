import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
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

@Component({
  selector: 'app-folder-page',
  imports: [CommonModule, ChatCard, Composer, ContextMenu],
  templateUrl: './folder-page.html',
  styleUrl: './folder-page.scss',
})
export class FolderPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly store = inject(Store);
  private readonly sse = inject(SseService);
  private readonly destroyRef = inject(DestroyRef);

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
      label: 'Chat öffnen',
      action: (id) => {
        this.router.navigate(['/', 'chat', id]);
      },
    },
    {
      id: 'moveOut',
      label: 'Chat aus Ordner nehmen',
      action: (id) => {
        if (id) {
          this.store.dispatch(new MoveChat(id, null));
        }
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

  ngOnInit() {
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
