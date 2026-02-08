import { NgModule } from '@angular/core';
import { CommonModule, NgTemplateOutlet } from '@angular/common';
import { Tab } from './tab';
import { Tabs } from './tabs';

@NgModule({
  declarations: [Tabs, Tab],
  imports: [CommonModule, NgTemplateOutlet],
  exports: [Tabs, Tab],
})
export class TabsModule {}
