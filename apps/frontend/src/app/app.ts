import { Component, OnInit, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { startUpApplication } from './core/utils/startup.util';
import { Store } from '@ngxs/store';
import { SseService } from './core/sse/sse.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  protected readonly title = signal('frontend');

  constructor(
    private store: Store,
    private sse: SseService,
  ) {}

  ngOnInit(): void {
    startUpApplication(this.store, this.sse);
  }
}
