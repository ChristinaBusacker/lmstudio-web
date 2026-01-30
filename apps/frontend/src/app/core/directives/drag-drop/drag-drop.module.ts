import { NgModule } from '@angular/core';
import { DropContainerDirective } from './drop-container.directive';
import { DragItemDirective } from './drag-item.directive';
import { DropTargetDirective } from './drop-target.directive';

@NgModule({
  imports: [DropContainerDirective, DragItemDirective, DropTargetDirective],
  exports: [DropContainerDirective, DragItemDirective, DropTargetDirective],
})
export class DragDropModule {}
