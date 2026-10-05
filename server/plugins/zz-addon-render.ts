import { useHooks } from '#server/utils/hooks';

/**
 * Injects addon-contributed markup into every rendered page, mirroring the
 * reference app's `head` / `body` / `footer` hooks — each addon listens with
 * hooks.filter('head', () => '<meta .../>') and the returned strings are
 * spliced into the document right before </head>, and right after/before
 * <body>...</body> respectively.
 */
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('render:html', async (html) => {
    const [head, body, footer] = await Promise.all([
      useHooks().collect('head'),
      useHooks().collect('body'),
      useHooks().collect('footer'),
    ]);

    html.head.push(...head);
    html.bodyPrepend.push(...body);
    html.bodyAppend.push(...footer);
  });
});
