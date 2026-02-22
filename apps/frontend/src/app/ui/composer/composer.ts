import { CommonModule, isPlatformBrowser } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  inject,
  Inject,
  Input,
  PLATFORM_ID,
  ViewChild,
} from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AssetsApi, type AssetDto } from '@frontend/src/app/core/api/assets.api';
import { Store } from '@ngxs/store';
import { catchError, map, Observable, of, tap } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { ChatsApi, type ChatMetaDto } from '../../core/api/chats.api';
import {
  OpenChat,
  SendMessage,
  SetPendingModelKey,
} from '../../core/state/chat-detail/chat-detail.actions';
import { ChatDetailState } from '../../core/state/chat-detail/chat-detail.state';
import { MoveChat, ReloadChats } from '../../core/state/chats/chats.actions';
import { CancelRun } from '../../core/state/runs/runs.actions';
import { LoadProfiles } from '../../core/state/settings/settings.actions';
import { SettingsState } from '../../core/state/settings/settings.state';
import { Icon } from '../icon/icon';
import { ToastService } from '../toast/toast.service';
import { DropFilesDirective } from './drop-files.directive';
import { I18nPipe } from '../../core/i18n/i18n.pipe';
import { SendMessagePayload } from '../../core/state/chat-detail/chat-detail.model';

@Component({
  selector: 'app-composer',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    Icon,
    DropFilesDirective,
    I18nPipe,
    RouterLink,
  ],
  templateUrl: './composer.html',
  styleUrl: './composer.scss',
})
export class Composer implements AfterViewInit {
  @Input() placeholder = 'composer.placeholder';
  @Input() forceTextarea = false;
  @Input() chatId?: string;
  @Input() folderId?: string;

  selectedProfile = '';

  constructor(
    @Inject(PLATFORM_ID) private readonly platformId: object,
    private api: ChatsApi,
    private router: Router,
    private assetsApi: AssetsApi,
    private toast: ToastService,
    private cdr: ChangeDetectorRef,
  ) {
    this.store.dispatch(new LoadProfiles());
  }

  store = inject(Store);

  @ViewChild('editable', { static: false })
  private editableRef?: ElementRef<HTMLDivElement>;

  @ViewChild('configSelect', { static: false })
  private configSelect?: ElementRef<HTMLSelectElement>;

  /**
   * We derive streaming/busy state from the chat detail run map.
   * RunsState is global and may not be SSE-driven in all flows.
   */
  readonly isStreaming$: Observable<boolean> = this.store.select(ChatDetailState.runs).pipe(
    map((runsMap) => {
      const runs = Object.values(runsMap ?? {});
      return runs.some((r) => r.status === 'queued' || r.status === 'running');
    }),
  );

  // Status messaging was moved into the chat thread (under the last user message).

  disabled = false;
  value = '';

  // Uploaded attachments for the next send()
  attachments: AssetDto[] = [];

  uploadError: string | null = null;

  isDragActive = false;

  @ViewChild('fileInput', { static: false })
  private fileInput?: ElementRef<HTMLInputElement>;

  activeRuns = this.store
    .select(ChatDetailState.runs)
    .pipe(
      map((runsMap) =>
        Object.values(runsMap ?? {}).filter((r) => r.status === 'queued' || r.status === 'running'),
      ),
    );

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

  selectProfile(): void {
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
    if (event.isComposing) return;

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

  private createChat(): Observable<ChatMetaDto | null> {
    return this.api.create({}).pipe(
      tap(async (created) => {
        this.store.dispatch(new OpenChat(created.id));

        if (this.folderId) {
          this.store.dispatch(new MoveChat(created.id, this.folderId));
        }

        this.store.dispatch(new ReloadChats());

        this.chatId = created.id;
        this.send();

        // Cause: I start routing on purpose and downt wait for it
        await this.router.navigate(['/chat', created.id]);
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

    const baseContent = this.value.trim();
    if (!baseContent) return;

    const content = this.attachments.length
      ? this.appendAttachmentsBlock(baseContent, this.attachments)
      : baseContent;

    const chatId = this.store.selectSnapshot(ChatDetailState.chatId);
    if (!chatId) return;

    const clientRequestId = uuidv4();

    // Wichtig: clear + DOM wirklich leeren
    this.clearEditorAndRefocus();

    // Clear attachments after successful trigger
    this.attachments = [];
    this.uploadError = null;

    const options: SendMessagePayload = {
      content,
      clientRequestId,
    };

    if (this.selectedProfile) {
      options.settingsProfileId = this.selectedProfile;
    }

    // Track the model key for nicer status messaging inside the chat thread. UI-only.
    if (this.selectedProfile) {
      const profiles = this.store.selectSnapshot(SettingsState.profiles);
      const p = profiles.find((x) => x.id === this.selectedProfile) ?? null;
      const modelKey = (p?.params as Record<string, unknown> | undefined)?.['modelKey'];
      this.store.dispatch(new SetPendingModelKey(typeof modelKey === 'string' ? modelKey : null));
    } else {
      this.store.dispatch(new SetPendingModelKey(null));
    }

    this.store.dispatch(new SendMessage(chatId, options));
  }

  openFilePicker(): void {
    if (this.disabled) return;
    this.uploadError = null;
    this.fileInput?.nativeElement?.click();
  }

  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const files = Array.from(input?.files ?? []);
    if (!files.length) return;

    // Allow selecting the same file again later
    if (input) input.value = '';

    this.uploadFiles(files);
  }

  onFilesDropped(files: File[]): void {
    if (this.disabled) return;
    this.uploadError = null;
    this.uploadFiles(files);
  }

  onDragActiveChange(active: boolean): void {
    this.isDragActive = active;
  }

  private uploadFiles(files: File[]): void {
    for (const f of files) {
      this.assetsApi.upload(f).subscribe({
        next: (asset) => {
          this.attachments = [...this.attachments, asset];
          this.toast.success('File uploaded', asset.originalFilename);
          setTimeout(() => {
            this.cdr.detectChanges();
          }, 300);
        },
        error: (err) => {
          console.error('[Assets] upload failed', err);
          this.uploadError = 'Upload failed.';
          this.toast.error('Upload failed', f.name);
        },
      });
    }
  }

  removeAttachment(id: string): void {
    this.attachments = this.attachments.filter((a) => a.id !== id);
  }

  private appendAttachmentsBlock(content: string, assets: AssetDto[]): string {
    const lines = assets
      .map(
        (a) =>
          `- ${a.originalFilename} (assetId: ${a.id}${a.mimeType ? `, mime: ${a.mimeType}` : ''})`,
      )
      .join('\n');

    return `${content}\n\n[Attachments]\n${lines}`;
  }

  abort(): void {
    if (!this.chatId) return;

    const runsMap = this.store.selectSnapshot(ChatDetailState.runs);
    const active = Object.values(runsMap ?? {}).filter(
      (r) => r.status === 'queued' || r.status === 'running',
    );
    if (!active.length) return;

    active.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
    this.store.dispatch(new CancelRun(active[0].runId));
  }

  private fallbackClientRequestId(): string {
    return uuidv4();
  }
}
