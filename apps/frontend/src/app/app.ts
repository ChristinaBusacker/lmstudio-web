import { Component, ElementRef, OnInit, signal, ViewChild } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { startUpApplication } from './core/utils/startup.util';
import { Store } from '@ngxs/store';
import { SseService } from './core/sse/sse.service';
import { Sidebar } from './ui/sidebar/sidebar';
import { Icon } from './ui/icon/icon';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Sidebar, Icon],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  protected readonly title = signal('frontend');
  isSidebarClosed = false;

  @ViewChild('toggle') sidebarToggle!: ElementRef<HTMLButtonElement>;

  constructor(
    private store: Store,
    private sse: SseService,
  ) {}

  ngOnInit(): void {
    startUpApplication(this.store, this.sse);
  }

  toggleSidebar() {
    this.isSidebarClosed = !this.isSidebarClosed;
    this.sidebarToggle.nativeElement.blur();
  }
}
