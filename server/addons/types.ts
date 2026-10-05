import type { H3Event } from 'h3';

/** Method + path pattern (":id" style params, matched the same way as Nitro routes). */
export interface AddonRoute {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string; // e.g. '/status' or '/servers/:id'
  handler: (event: H3Event, params: Record<string, string>) => unknown | Promise<unknown>;
}

export interface AddonContext {
  /** Absolute path to this addon's own migrations folder (drizzle-kit generated). */
  migrationsDir?: string;
  /**
   * The panel hook bus — use hooks.on()/emit() for "this happened" events
   * (model CRUD, auth.login) and hooks.filter()/collect() for content
   * addons contribute (navigation, pages.home, head/body/footer). See
   * server/utils/hooks.ts for the full event catalogue.
   */
  hooks: ReturnType<typeof import('#server/utils/hooks').useHooks>;
  registerRoute(route: AddonRoute): void;
}

export interface AddonManifest {
  /** Unique slug — also used as the migration-tracking schema name and API namespace. */
  name: string;
  version: string;
  /** Called once at boot, before migrations run. Register routes/nav/hook listeners here. */
  register(ctx: AddonContext): void | Promise<void>;
  /** Called once at boot, after this addon's migrations have run. Optional. */
  boot?(ctx: AddonContext): void | Promise<void>;
}
