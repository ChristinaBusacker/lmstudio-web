import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Store } from '@ngxs/store';

import { SseService } from './core/sse/sse.service';
import { startUpApplication } from './core/utils/startup.util';
import { Icon } from './ui/icon/icon';
import { Sidebar } from './ui/sidebar/sidebar';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Sidebar, Icon],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App implements OnInit {
  private readonly store = inject(Store);
  private readonly sse = inject(SseService);

  protected readonly title = signal('frontend');
  isSidebarClosed = false;

  @ViewChild('toggle') sidebarToggle!: ElementRef<HTMLButtonElement>;

  ngOnInit(): void {
    startUpApplication(this.store, this.sse);
  }

  toggleSidebar(): void {
    this.isSidebarClosed = !this.isSidebarClosed;
    this.sidebarToggle.nativeElement.blur();
  }
}
