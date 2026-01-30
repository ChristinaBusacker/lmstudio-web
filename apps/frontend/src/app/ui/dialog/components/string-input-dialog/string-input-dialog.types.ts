import { DialogData } from '../../dialog.types';

export interface StringInputDialogData extends DialogData {
  placeholder?: string;
  initialValue?: string;
  hint?: string;
}
