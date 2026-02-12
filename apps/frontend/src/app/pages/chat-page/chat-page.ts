import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  DestroyRef,
  ElementRef,
  ViewChild,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { Store } from '@ngxs/store';

import { SseService } from '../../core/sse/sse.service';
import { CloseChat, OpenChat } from '../../core/state/chat-detail/chat-detail.actions';
import { ChatDetailState } from '../../core/state/chat-detail/chat-detail.state';

import { distinctUntilChanged, filter, map, switchMap, tap } from 'rxjs';
import { FoldersState } from '../../core/state/folders/folders.state';
import { Composer } from '../../ui/composer/composer';
import { Message } from '../../ui/message/message';

@Component({
  selector: 'app-chat-page',
  standalone: true,
  imports: [CommonModule, Composer, Message],
  templateUrl: './chat-page.html',
  styleUrl: './chat-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatPage implements AfterViewInit, OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly store = inject(Store);
  private readonly sse = inject(SseService);
  private readonly destroyRef = inject(DestroyRef);

  public chatId = '';

  @ViewChild('scrollContainer', { static: true })
  private readonly scrollContainer!: ElementRef<HTMLElement>;

  /** autoscroll nur wenn user “unten” ist */
  private readonly shouldAutoScroll = signal(true);

  /** Store signals */
  readonly loading = this.store.selectSignal(ChatDetailState.loading);
  readonly meta = this.store.selectSignal(ChatDetailState.meta);

  readonly folder = computed(() => {
    const folderId = this.meta()?.folderId ?? null;
    return folderId ? this.store.selectSnapshot(FoldersState.byId(folderId)) : null;
  });

  readonly messages = this.store.selectSignal(ChatDetailState.messages);
  readonly runsMap = this.store.selectSignal(ChatDetailState.runs);

  constructor() {
    effect(() => {
      const _len = this.messages().length;
      const _last = this.lastMessageKey();
      queueMicrotask(() => this.scrollToBottom(false));
    });
  }

  /** Cancel Mode: irgendein Run ist queued/running */
  readonly isCancelMode = computed(() => {
    const runs = this.runsMap();
    if (!runs) return false;

    for (const k of Object.keys(runs)) {
      const s = runs[k]?.status;
      if (s === 'queued' || s === 'running') return true;
    }
    return false;
  });

  /** Für autoscroll: beobachte “letzte message content”, weil streaming snapshots das ändern */
  private readonly lastMessageKey = computed(() => {
    const msgs = this.messages();
    const last = msgs[msgs.length - 1];
    if (!last) return '';
    const content = last.activeVariant?.content ?? '';
    // key = id + content length (reicht als trigger)
    return `${last.id}:${content.length}`;
  });

  ngOnInit(): void {
    this.route.paramMap
      .pipe(
        map((pm) => pm.get('chatId')),
        filter((id): id is string => !!id),
        distinctUntilChanged(),
        tap((chatId) => {
          this.sse.disconnectChat();
          this.store.dispatch(new CloseChat());

          this.chatId = chatId;
          this.sse.connectChat(chatId);
        }),
        switchMap((chatId) => this.store.dispatch(new OpenChat(chatId))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => queueMicrotask(() => this.scrollToBottom(true)),
      });
  }

  ngAfterViewInit(): void {}

  ngOnDestroy(): void {
    this.sse.disconnectChat();
    this.store.dispatch(new CloseChat());
  }

  onScroll(): void {
    const el = this.scrollContainer.nativeElement;
    const thresholdPx = 160;
    const distanceFromBottom = el.scrollHeight - (el.scrollTop + el.clientHeight);
    this.shouldAutoScroll.set(distanceFromBottom < thresholdPx);
  }

  private scrollToBottom(force: boolean): void {
    const el = this.scrollContainer?.nativeElement;
    if (!el) return;
    if (!force && !this.shouldAutoScroll()) return;
    el.scrollTop = el.scrollHeight;
  }

  trackById(_: number, m: { id: string }): string {
    return m.id;
  }
}
