import { useAddonRegistry } from '#server/addons/loader';
import { requireAuth } from '#server/utils/security';

/**
 * Runtime dispatcher for every addon-registered route. An addon calls
 * ctx.registerRoute({ method, path, handler }) during its register() phase
 * (see server/addons/types.ts) and it becomes reachable at
 * /api/addons/<addon-name><path> with no core file changes and no rebuild —
 * only a server restart to pick up a newly dropped-in addons/<name>/ folder.
 *
 * requireAuth() here only guarantees *some* logged-in session (this path isn't
 * in auth.global.ts's public allowlist, so that's already true today — this
 * makes it explicit and locally enforced rather than implicit). Anything past
 * "logged in" — admin-only, per-server permission checks, etc. — is each
 * addon route handler's own responsibility, exactly like a core
 * server/api/*.ts file. See addons/example-hello/addon.ts for the pattern.
 */
export default defineEventHandler(async (event) => {
  await requireAuth(event);

  const addonName = getRouterParam(event, 'addon');
  const rest = getRouterParam(event, 'path') ?? '';
  if (!addonName) {
    throw createError({ statusCode: 404, statusMessage: 'Addon not specified' });
  }

  const path = `/${rest}`;
  const match = useAddonRegistry().match(addonName, event.method, path);

  if (!match) {
    throw createError({ statusCode: 404, statusMessage: `No addon route for ${event.method} ${path}` });
  }

  return match.route.handler(event, match.params);
});
