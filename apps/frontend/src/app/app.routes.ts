import { Routes } from '@angular/router';
import { OverviewPage } from './pages/overview-page/overview-page';
import { ChatPage } from './pages/chat-page/chat-page';
import { SettingsPage } from './pages/settings-page/settings-page';
import { FolderPage } from './pages/folder-page/folder-page';
import { WorkflowPage } from './pages/workflow-page/workflow-page';

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
  {
    path: 'folder/:folderId',
    component: FolderPage,
  },
  {
    path: 'settings',
    component: SettingsPage,
  },
  {
    path: 'workflow/:workflowId',
    component: WorkflowPage,
  },
];
