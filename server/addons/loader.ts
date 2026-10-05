import { existsSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { createJiti } from 'jiti';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { useDrizzle } from '#server/utils/drizzle';
import { useHooks } from '#server/utils/hooks';
import type { AddonContext, AddonManifest, AddonRoute } from './types';

// addons/ lives outside server/, so it's never picked up by Nitro's own
// build — its addon.ts files are TypeScript, using the same "#server/*"
// alias core code uses, and Node can't natively import either. jiti (already
// a Nuxt/Nitro dependency, used the same way to load nuxt.config.ts) gives
// us on-the-fly TS transpilation plus alias resolution at runtime.
const addonJiti = createJiti(import.meta.url, {
  alias: {
    '#server': resolve(process.cwd(), 'server'),
    '#shared': resolve(process.cwd(), 'shared'),
  },
});

interface LoadedAddon {
  manifest: AddonManifest;
  routes: AddonRoute[];
}

class AddonRegistry {
  private addons = new Map<string, LoadedAddon>();
  private loaded = false;

  /** Discovers addons/<name>/addon.ts, runs register(), runs each addon's own
   *  migrations against its own tracking schema, then runs boot(). Idempotent. */
  async loadAll(addonsRoot = resolve(process.cwd(), 'addons')) {
    if (this.loaded) return;
    this.loaded = true;

    if (!existsSync(addonsRoot)) return;

    const dirs = readdirSync(addonsRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    for (const dir of dirs) {
      // A broken or unreachable addon (bad manifest, failed migration, a
      // hook listener that throws during boot) must never take the whole
      // panel down — log it and move on to the next addon instead.
      try {
        await this.loadOne(addonsRoot, dir);
      } catch (err) {
        console.error(`[addons] Failed to load "${dir}", skipping:`, err);
        this.addons.delete(dir);
      }
    }
  }

  private async loadOne(addonsRoot: string, dir: string) {
    const entryTs = resolve(addonsRoot, dir, 'addon.ts');
    const entryJs = resolve(addonsRoot, dir, 'addon.js');
    const entry = existsSync(entryTs) ? entryTs : existsSync(entryJs) ? entryJs : null;
    if (!entry) return;

    const mod = await addonJiti.import<{ default?: AddonManifest; addon?: AddonManifest }>(entry);
    const manifest = mod.default ?? mod.addon;
    if (!manifest?.name) {
      console.error(`[addons] Skipping "${dir}": missing default-exported manifest.`);
      return;
    }

    const migrationsDir = resolve(addonsRoot, dir, 'migrations');
    const loaded: LoadedAddon = { manifest, routes: [] };
    this.addons.set(manifest.name, loaded);

    const ctx: AddonContext = {
      migrationsDir: existsSync(migrationsDir) ? migrationsDir : undefined,
      hooks: useHooks(),
      registerRoute: (route) => loaded.routes.push(route),
    };

    await manifest.register(ctx);

    if (ctx.migrationsDir) {
      await this.runAddonMigrations(manifest.name, ctx.migrationsDir);
    }

    await manifest.boot?.(ctx);

    console.log(`[addons] Loaded "${manifest.name}" v${manifest.version}`);
  }

  private async runAddonMigrations(name: string, migrationsFolder: string) {
    const db = useDrizzle();
    // Each addon gets its own migrations-tracking schema so its migration
    // history can never collide with core's or another addon's.
    const migrationsSchema = `drizzle_addon_${name.replace(/[^a-z0-9_]/gi, '_')}`;
    try {
      await migrate(db, { migrationsFolder, migrationsSchema });
    } catch (err) {
      console.error(`[addons] Migration failed for "${name}":`, err);
      throw err;
    }
  }

  /** Finds the addon-registered handler for a method+path under /api/addons/:addon/... */
  match(addonName: string, method: string, path: string) {
    const addon = this.addons.get(addonName);
    if (!addon) return null;

    for (const route of addon.routes) {
      if (route.method !== method) continue;
      const params = matchPath(route.path, path);
      if (params) return { route, params };
    }
    return null;
  }

  list() {
    return [...this.addons.values()].map((a) => ({
      name: a.manifest.name,
      version: a.manifest.version,
    }));
  }
}

function matchPath(pattern: string, path: string): Record<string, string> | null {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = path.split('/').filter(Boolean);
  if (patternParts.length !== pathParts.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i++) {
    const p = patternParts[i]!;
    const v = pathParts[i]!;
    if (p.startsWith(':')) {
      params[p.slice(1)] = decodeURIComponent(v);
    } else if (p !== v) {
      return null;
    }
  }
  return params;
}

let registry: AddonRegistry | null = null;

export function useAddonRegistry(): AddonRegistry {
  if (!registry) registry = new AddonRegistry();
  return registry;
}
