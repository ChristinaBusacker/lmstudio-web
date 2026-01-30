/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable, Injector } from '@angular/core';
import { Overlay, OverlayRef } from '@angular/cdk/overlay';
import { ComponentPortal, ComponentType } from '@angular/cdk/portal';

import { DialogRef } from './dialog-ref';
import { DialogConfig } from './dialog.types';
import { DIALOG_DATA } from './dialog.tokens';
import { ConfirmDialog } from './components/confirm-dialog/confirm-dialog';
import { ConfirmDialogData } from './components/confirm-dialog/confirm-dialog.types';
import { DialogContext } from './dialog.context';
import { StringInputDialog } from './components/string-input-dialog/string-input-dialog';
import { StringInputDialogData } from './components/string-input-dialog/string-input-dialog.types';

@Injectable({ providedIn: 'root' })
export class DialogService {
  constructor(
    private readonly overlay: Overlay,
    private readonly injector: Injector,
  ) {}

  open<TComponent, TResult = unknown, D = unknown>(
    component: ComponentType<TComponent>,
    config: DialogConfig<D> = {},
  ): DialogRef<TResult> {
    const overlayRef = this.createOverlay(config);
    const dialogRef = new DialogRef<TResult>();

    const ctx = new DialogContext<TResult>();

    if (config.hasBackdrop !== false && config.closeOnBackdropClick !== false) {
      overlayRef.backdropClick().subscribe(() => {
        dialogRef.close({ action: 'close', data: ctx.result() } as any);
      });
    }

    const portalInjector = Injector.create({
      parent: this.injector,
      providers: [
        { provide: DialogRef, useValue: dialogRef },
        { provide: DIALOG_DATA, useValue: config.data },
        { provide: DialogContext, useValue: ctx },
      ],
    });

    overlayRef.attach(new ComponentPortal(component, undefined, portalInjector));

    dialogRef.afterClosed().subscribe(() => overlayRef.dispose());

    return dialogRef;
  }

  private createOverlay<D>(config: DialogConfig<D>): OverlayRef {
    const positionStrategy = this.overlay
      .position()
      .global()
      .centerHorizontally()
      .centerVertically();

    return this.overlay.create({
      hasBackdrop: config.hasBackdrop !== false,
      backdropClass: config.backdropClass ?? 'app-dialog-backdrop',
      panelClass: config.panelClass ?? 'app-dialog-panel',
      scrollStrategy: this.overlay.scrollStrategies.block(),
      positionStrategy,
      width: config.width,
      maxWidth: config.maxWidth ?? '90vw',
    });
  }

  confirm<TResult = unknown>(
    data?: ConfirmDialogData,
    config?: Omit<DialogConfig<ConfirmDialogData>, 'data'>,
  ): DialogRef<TResult> {
    return this.open(ConfirmDialog as ComponentType<ConfirmDialog>, {
      hasBackdrop: true,
      closeOnBackdropClick: true, // 👈 Confirm per Backdrop schließen = action 'close'
      closeOnEsc: true,
      ...(config ?? {}),
      data: {
        title: 'Confirm',
        confirmLabel: 'Confirm',
        declineLabel: 'Decline',
        closeLabel: 'Close',
        ...(data ?? {}),
      },
    });
  }

  prompt(data?: StringInputDialogData): DialogRef<string> {
    return this.open(StringInputDialog as ComponentType<StringInputDialog>, {
      hasBackdrop: true,
      closeOnBackdropClick: true,
      closeOnEsc: true,
      data: {
        title: 'Enter value',
        confirmLabel: 'Save',
        declineLabel: 'Cancel',
        closeLabel: null,
        ...(data ?? {}),
      },
    });
  }
}
