import { Routes } from '@angular/router';
import { OverviewPage } from './pages/overview-page/overview-page';
import { ChatPage } from './pages/chat-page/chat-page';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    component: OverviewPage,
  },
  {
    path: 'chat/:chatId',
    component: ChatPage,
  },
];
