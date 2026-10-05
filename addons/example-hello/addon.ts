import { readBody } from 'h3';
import { usePool } from '#server/utils/drizzle';
import { requireAdmin } from '#server/utils/security';
import type { AddonManifest } from '#server/addons/types';

/**
 * Reference addon: owns one table, two API routes, an action-event listener,
 * and one of each filter hook (nav / page content / head injection). Copy
 * this folder as the starting point for a real addon — nothing here is
 * wired into core; everything goes through the addon API
 * (server/addons/types.ts) so it can be dropped in or removed cleanly.
 */
const addon: AddonManifest = {
  name: 'example-hello',
  version: '1.0.0',

  register(ctx) {
    // React to a core domain event without touching the handler that emits it.
    ctx.hooks.on('server.created', async ({ id, userId }) => {
      await usePool().query(
        'INSERT INTO example_hello_pings (message) VALUES ($1)',
        [`server ${id} created by ${userId}`],
      );
    });

    ctx.hooks.on('auth.login', async ({ userId }) => {
      await usePool().query(
        'INSERT INTO example_hello_pings (message) VALUES ($1)',
        [`user ${userId} logged in`],
      );
    });

    // Contributes one admin nav item — every listener on this event across
    // every addon gets merged and sorted by priority (see nav.get.ts).
    ctx.hooks.filter('navigation.dashboard', () => ({
      name: 'Example Hello',
      url: '/admin/addons/example-hello',
      priority: 50,
    }));

    // Adds a block to the dashboard home page (see pages/home.get.ts).
    ctx.hooks.filter('pages.home', () => ({
      html: '<div class="example-hello-widget">Hello from an addon!</div>',
    }));

    // Injected right before </head> on every page render (zz-addon-render.ts).
    ctx.hooks.filter('head', () => '<meta name="example-hello" content="active">');

    // GET /api/addons/example-hello/pings
    // The dispatcher (server/api/addons/[addon]/[...path].ts) only guarantees the
    // caller has *some* logged-in session — every addon route is responsible for
    // its own authorization beyond that, exactly like a core server/api/*.ts file
    // would call requireAdmin/requireAccountUser/requireServerPermission. This
    // route's data (login/server-creation activity) is admin-facing, so it
    // requires an admin session; don't drop this check when copying the template.
    ctx.registerRoute({
      method: 'GET',
      path: '/pings',
      async handler(event) {
        await requireAdmin(event);
        const { rows } = await usePool().query(
          'SELECT id, message, created_at FROM example_hello_pings ORDER BY id DESC LIMIT 50',
        );
        return { pings: rows };
      },
    });

    // POST /api/addons/example-hello/pings
    ctx.registerRoute({
      method: 'POST',
      path: '/pings',
      async handler(event) {
        await requireAdmin(event);
        const body = await readBody<{ message: string }>(event);
        const { rows } = await usePool().query(
          'INSERT INTO example_hello_pings (message) VALUES ($1) RETURNING id, message, created_at',
          [body.message],
        );
        return rows[0];
      },
    });
  },

  async boot() {
    console.log('[example-hello] booted');
  },
};

export default addon;
