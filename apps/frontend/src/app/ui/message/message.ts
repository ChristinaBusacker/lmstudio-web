import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { ThreadMessageDto } from '../../core/api/chat-thread.api';
import { MarkdownModule } from 'ngx-markdown';

@Component({
  selector: 'app-message',
  imports: [CommonModule, MarkdownModule],
  templateUrl: './message.html',
  styleUrl: './message.scss',
})
export class Message {
  @Input() message!: ThreadMessageDto;
}
