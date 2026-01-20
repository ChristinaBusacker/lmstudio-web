import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Store } from '@ngxs/store';
import { SseService } from '../../core/sse/sse.service';
import { OpenChat, CloseChat } from '../../core/state/chat-detail/chat-detail.actions';

@Component({
  selector: 'app-chat-page',
  imports: [],
  templateUrl: './chat-page.html',
  styleUrl: './chat-page.scss',
})
export class ChatPage {
  private readonly route = inject(ActivatedRoute);
  private readonly store = inject(Store);
  private readonly sse = inject(SseService);

  ngOnInit() {
    const chatId = this.route.snapshot.paramMap.get('chatId');
    if (!chatId) return;

    this.sse.connectChat(chatId);
    this.store.dispatch(new OpenChat(chatId));
  }

  ngOnDestroy() {
    this.sse.disconnectChat();
    this.store.dispatch(new CloseChat());
  }
}
