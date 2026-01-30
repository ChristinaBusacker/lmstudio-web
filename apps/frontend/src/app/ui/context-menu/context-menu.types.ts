export type ContextMenuItem<TContext = unknown> = {
  id: string;
  label: string;
  icon?: string; // optional, falls du deine app-icon nutzen willst
  danger?: boolean;
  disabled?: boolean | ((ctx: TContext) => boolean);
  hidden?: boolean | ((ctx: TContext) => boolean);
  action: (ctx: TContext) => void | Promise<void>;
};

export type ContextMenuPosition = { x: number; y: number };

export type MenuState = {
  open: boolean;
  pos: ContextMenuPosition; // PAGE coords!
  chatId: string | null;
};
