/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { CommonModule, isPlatformBrowser } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  inject,
  Inject,
  Input,
  PLATFORM_ID,
  ViewChild,
} from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Store } from '@ngxs/store';
import { catchError, map, Observable, of, tap } from 'rxjs';
import { ChatsApi } from '../../core/api/chats.api';
import { OpenChat, SendMessage } from '../../core/state/chat-detail/chat-detail.actions';
import { ChatDetailState } from '../../core/state/chat-detail/chat-detail.state';
import { MoveChat, ReloadChats } from '../../core/state/chats/chats.actions';
import { CancelRun } from '../../core/state/runs/runs.actions';
import { RunsState } from '../../core/state/runs/runs.state';
import { LoadProfiles } from '../../core/state/settings/settings.actions';
import { SettingsState } from '../../core/state/settings/settings.state';
import { Icon } from '../icon/icon';

@Component({
  selector: 'app-composer',
  imports: [CommonModule, FormsModule, ReactiveFormsModule, Icon],
  templateUrl: './composer.html',
  styleUrl: './composer.scss',
})
export class Composer implements AfterViewInit {
  @Input() placeholder = 'Schreibe etwas...';
  @Input() forceTextarea = false;
  @Input() chatId?: string;
  @Input() folderId?: string;

  selectedProfile = '';

  constructor(
    @Inject(PLATFORM_ID) private readonly platformId: object,
    private api: ChatsApi,
    private router: Router,
  ) {
    this.store.dispatch(new LoadProfiles());
  }

  store = inject(Store);

  @ViewChild('editable', { static: false })
  private editableRef?: ElementRef<HTMLDivElement>;

  @ViewChild('configSelect', { static: false })
  private configSelect?: ElementRef<HTMLSelectElement>;

  isStreaming$: Observable<boolean> = this.chatId
    ? this.store.select(RunsState.activeByChat(this.chatId)).pipe(
        map((runIds) => {
          return false;
        }),
      )
    : of(false);

  disabled = false;
  value = '';

  activeRuns = this.chatId ? this.store.select(RunsState.activeByChat(this.chatId)) : of([]);

  profiles$ = this.store.select(SettingsState.profiles);

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  get useContentEditable(): boolean {
    if (this.forceTextarea) return false;
    return isPlatformBrowser(this.platformId);
  }

  ngAfterViewInit(): void {
    // Wenn ViewChild erst nachträglich kommt: einmal initial syncen
    queueMicrotask(() => this.syncViewFromValue());
  }

  // ---- ControlValueAccessor ----
  writeValue(value: string | null): void {
    this.value = value ?? '';
    this.syncViewFromValue();
  }

  selectProfile() {
    const value = this.configSelect?.nativeElement.value;

    if (value) {
      this.selectedProfile = value;
    }
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
    this.syncViewFromValue();
  }

  // ---- DOM -> Model ----
  onEditableInput(): void {
    if (this.disabled) return;
    const el = this.editableRef?.nativeElement;
    if (!el) return;

    // innerText liefert bei "leer" manchmal "\n" → normalize
    const next = (el.innerText ?? '').replace(/\r\n/g, '\n').replace(/^\n$/, '');
    this.setValueFromUser(next);
  }

  onTextareaInput(event: Event): void {
    if (this.disabled) return;
    const target = event.target as HTMLTextAreaElement | null;
    const next = (target?.value ?? '').replace(/\r\n/g, '\n');
    this.setValueFromUser(next);
  }

  markTouched(): void {
    this.onTouched();
  }

  // ---- Enter Handling ----
  onComposerKeydown(event: KeyboardEvent): void {
    if (this.disabled) return;

    // IME / composition: niemals auf Enter senden
    if ((event as any).isComposing) return;

    if (event.key !== 'Enter') return;

    // Mobile: Enter = Zeilenumbruch (nie senden)
    if (this.isMobileLike()) return;

    // Desktop: Shift+Enter = Umbruch
    if (event.shiftKey) return;

    // Desktop: Enter = senden
    event.preventDefault();
    this.send();
  }

  private isMobileLike(): boolean {
    if (!isPlatformBrowser(this.platformId)) return false;

    // Robust: coarse pointer oder Touchpoints
    const coarse =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(pointer: coarse)').matches;

    const touch = typeof navigator !== 'undefined' && (navigator.maxTouchPoints ?? 0) > 0;
    return coarse || touch;
  }

  // ---- helpers ----
  private setValueFromUser(next: string): void {
    if (next === this.value) return;
    this.value = next;
    this.onChange(this.value);
  }

  private clearEditorAndRefocus(): void {
    this.value = '';
    this.onChange('');

    // contenteditable DOM wirklich leeren (sonst bleibt gern <br> / "\n")
    const el = this.editableRef?.nativeElement;
    if (this.useContentEditable && el) {
      el.replaceChildren(); // <- der zuverlässige Teil
      // Optional: falls du wirklich GAR nix drin willst:
      // el.textContent = '';
      queueMicrotask(() => el.focus());
    }
  }

  private syncViewFromValue(): void {
    if (!this.useContentEditable) return;
    const el = this.editableRef?.nativeElement;
    if (!el) return;

    // Wenn value leer ist: hart leeren, damit :empty greift
    if (!this.value) {
      el.replaceChildren();
      return;
    }

    const current = (el.innerText ?? '').replace(/\r\n/g, '\n').replace(/^\n$/, '');
    if (current === this.value) return;

    el.innerText = this.value;
  }

  private createChat() {
    return this.api.create({}).pipe(
      tap((created) => {
        this.store.dispatch(new OpenChat(created.id));

        if (this.folderId) {
          this.store.dispatch(new MoveChat(created.id, this.folderId));
        }

        this.store.dispatch(new ReloadChats());

        this.chatId = created.id;
        this.send();
        this.router.navigate(['/chat', created.id]);
      }),
      catchError((err) => {
        console.error('[Chats] create failed', err);
        return of(null);
      }),
    );
  }

  // ---- actions ----
  send(): void {
    if (this.chatId === null) {
      this.createChat().subscribe();
      return;
    }

    const content = this.value.trim();
    if (!content) return;

    const chatId = this.store.selectSnapshot(ChatDetailState.chatId);
    if (!chatId) return;

    const clientRequestId = crypto.randomUUID();

    // Wichtig: clear + DOM wirklich leeren
    this.clearEditorAndRefocus();

    const options: any = {
      content,
      clientRequestId,
    };

    if (this.selectedProfile) {
      options.settingsProfileId = this.selectedProfile;
    }

    this.store.dispatch(new SendMessage(chatId, options));
  }

  abort() {
    if (!this.chatId) return;

    const run = this.store.selectSnapshot(RunsState.activeByChat(this.chatId))[0];
    if (!run) return;

    const runId = run.id;

    this.store.dispatch(new CancelRun(runId));
  }

  private fallbackClientRequestId(): string {
    return crypto.randomUUID();
  }
}
