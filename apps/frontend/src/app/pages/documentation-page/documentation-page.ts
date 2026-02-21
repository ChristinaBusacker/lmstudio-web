// Comments in English as requested.

import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Store } from '@ngxs/store';
import { MarkdownModule } from 'ngx-markdown';

import { TabsModule } from '../../ui/tabs/tabs-module';
import { I18nPipe } from '../../core/i18n/i18n.pipe';
import { I18nState } from '../../core/i18n/i18n.state';
import type { LanguageCode } from '../../core/state/user-preferences/user-preferences.model';
import { en_doc } from './docs/en.doc';
import { de_doc } from './docs/de.doc';
import { fr_doc } from './docs/fr.doc';

type DocTabId = 'general' | 'workflows';

interface DocContent {
  title: string;
  tabs: Record<DocTabId, { heading: string; markdown: string }>;
}

@Component({
  selector: 'app-documentation-page',
  imports: [CommonModule, TabsModule, MarkdownModule, I18nPipe],
  templateUrl: './documentation-page.html',
  styleUrl: './documentation-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentationPage {
  private readonly store = inject(Store);

  readonly language = this.store.selectSignal(I18nState.language);

  readonly content = computed<DocContent>(() => {
    const lang = (this.language() ?? 'en') as LanguageCode;
    return DOCS[lang] ?? DOCS.en;
  });
}

const DOCS: Record<LanguageCode, DocContent> = {
  en: {
    title: 'Documentation',
    tabs: {
      ...en_doc,
    },
  },
  de: {
    title: 'Dokumentation',
    tabs: {
      ...de_doc,
    },
  },
  fr: {
    title: 'Documentation',
    tabs: {
      ...fr_doc,
    },
  },
};
