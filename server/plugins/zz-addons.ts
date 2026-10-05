import { useAddonRegistry } from '#server/addons/loader';

// Prefixed "zz-" so it loads after migrations.ts / storage.ts alphabetically —
// addons may assume core's DB pool and cache storage are already initialized.
export default defineNitroPlugin(async () => {
  await useAddonRegistry().loadAll();
});
