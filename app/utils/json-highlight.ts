function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Colorizes a JSON string for display via v-html. Escapes &/</> before tokenizing so
 * injected HTML in a value (e.g. a user-supplied description) can't break out of the
 * <code> block — quotes are left as-is since they're safe in HTML text content and
 * the regex below needs them to tell strings/keys apart from other tokens.
 */
export function colorizeJson(json: string): string {
  const escaped = escapeHtml(json);
  return escaped.replace(
    /("(?:\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\btrue\b|\bfalse\b|\bnull\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      let colorClass = 'text-amber-600 dark:text-amber-400'; // number
      if (match.startsWith('"')) {
        colorClass = match.endsWith(':')
          ? 'text-blue-600 dark:text-blue-400' // object key
          : 'text-green-600 dark:text-green-400'; // string value
      } else if (match === 'true' || match === 'false') {
        colorClass = 'text-purple-600 dark:text-purple-400'; // boolean
      } else if (match === 'null') {
        colorClass = 'text-muted-foreground'; // null
      }
      return `<span class="${colorClass}">${match}</span>`;
    },
  );
}

/** Colorizes an already-stringified JSON value, or stringifies + colorizes raw data. */
export function colorizeJsonValue(data: unknown): string {
  return colorizeJson(typeof data === 'string' ? data : JSON.stringify(data, null, 2));
}
