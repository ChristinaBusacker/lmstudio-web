export type DialogAction = 'confirm' | 'decline' | 'close' | (string & {});

export interface DialogResult<T = unknown> {
  action: DialogAction;
  data?: T;
}

export interface DialogConfig<D = unknown> {
  data?: D;
  hasBackdrop?: boolean;
  closeOnBackdropClick?: boolean;
  closeOnEsc?: boolean;

  panelClass?: string | string[];
  backdropClass?: string | string[];
  width?: string;
  maxWidth?: string;
}

export interface DialogData {
  title?: string;

  confirmLabel?: string;
  declineLabel?: string | null;
  closeLabel?: string | null;
}
