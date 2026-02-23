export interface EmailConfig {
  service?: string | null;
  host?: string | null;
  port?: number | null;
  secure?: boolean;
  user?: string | null;
  pass?: string | null;
}
