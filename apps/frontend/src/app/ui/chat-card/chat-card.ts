import { Component, Input } from '@angular/core';
import { ChatListItemDto } from '../../core/api/chats.api';
import { CommonModule } from '@angular/common';
import { LocalizedTimeDirective } from '../../core/directives/localized-time/localized-time.directive';
import { Icon } from '../icon/icon';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-chat-card',
  imports: [CommonModule, LocalizedTimeDirective, Icon, RouterLink],
  templateUrl: './chat-card.html',
  styleUrl: './chat-card.scss',
})
export class ChatCard {
  @Input() chat: ChatListItemDto;
}
