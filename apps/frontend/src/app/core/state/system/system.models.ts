export type ExternalServiceStatus = {
  name: string;
  enabled: boolean;
  ok: boolean;
  baseUrl?: string | null;
  error?: string | null;
};

export type SystemStateModel = {
  external: Record<string, ExternalServiceStatus>;
};
