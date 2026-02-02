import { Component, DestroyRef, inject, OnInit, ViewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Store } from '@ngxs/store';
import { debounceTime, distinctUntilChanged, Observable, tap } from 'rxjs';

import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { SearchChatResultDto } from '@frontend/src/app/core/api/search.api';
import {
  ClearSearchResults,
  ExecuteSearch,
  SearchTermChanged,
} from '@frontend/src/app/core/state/chat-search/chat-search.actions';
import { ChatSearchState } from '@frontend/src/app/core/state/chat-search/chat-search.state';
import { Icon } from '../../../icon/icon';
import { Dialog } from '../../dialog';
import { DialogContext } from '../../dialog.context';
import { DIALOG_DATA } from '../../dialog.tokens';

@Component({
  selector: 'search-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, Dialog, Icon],
  templateUrl: './search-dialog.html',
  styleUrls: ['./search-dialog.scss'],
})
export class SearchDialog implements OnInit {
  private readonly ctx = inject<DialogContext<string>>(DialogContext);
  readonly data = inject<SearchDialog | null>(DIALOG_DATA, { optional: true }) ?? null;

  @ViewChild('dialog') dialog!: Dialog;

  private readonly store = inject(Store);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);

  readonly input = new FormControl<string>('', { nonNullable: true });

  readonly isLoading$: Observable<boolean> = this.store.select(ChatSearchState.loading);
  readonly results$: Observable<SearchChatResultDto[]> = this.store.select(ChatSearchState.results);
  readonly error$: Observable<string | null> = this.store.select(ChatSearchState.error);

  constructor() {
    this.ctx.setResult(this.input.value);

    this.input.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => this.ctx.setResult(value));
  }

  async navigateToResult(result: SearchChatResultDto) {
    this.store.dispatch(new ClearSearchResults());
    await this.router.navigate(['/', 'chat', result.chatId]);
    this.dialog.close();
  }

  hasMatchingTitle(result: SearchChatResultDto) {
    result.matches.some((m) => m.type === 'title');
  }

  getMatch(result: SearchChatResultDto) {
    return result.matches.find((m) => m.type !== 'title');
  }

  ngOnInit(): void {
    this.input.valueChanges
      .pipe(
        debounceTime(1500),
        distinctUntilChanged(),
        tap((term) => {
          this.store.dispatch(new SearchTermChanged(term, { includeSnippets: true }));
          this.store.dispatch(new ExecuteSearch());
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }
}
