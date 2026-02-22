import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { Store } from '@ngxs/store';
import { UserPreferencesState } from './core/state/user-preferences/user-preferences.state';
import { Icon } from './ui/icon/icon';
import { Sidebar } from './ui/sidebar/sidebar';
import { ToastContainer } from './ui/toast/toast-container';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Sidebar, Icon, ToastContainer],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly title = signal('LMStudio Web');
  isSidebarClosed = false;

  private readonly store = inject(Store);
  private readonly document = inject(DOCUMENT);

  @ViewChild('toggle') sidebarToggle!: ElementRef<HTMLButtonElement>;

  constructor() {
    this.store.select(UserPreferencesState.theme).subscribe((theme) => {
      const body = this.document.body;
      for (const c of Array.from(body.classList)) {
        if (c.startsWith('theme-')) body.classList.remove(c);
      }
      body.classList.add(`theme-${theme}`);
    });
  }

  toggleSidebar(): void {
    this.isSidebarClosed = !this.isSidebarClosed;
    this.sidebarToggle.nativeElement.blur();
  }
}
