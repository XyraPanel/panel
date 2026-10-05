/**
 * Panel-wide hook bus — the Laravel `Event::listen(...)` equivalent for this
 * codebase. Two flavors, matching the two ways the reference app uses hooks:
 *
 *  - Action events (`on` / `emit`): "something happened" — model
 *    created/updated/deleted, auth.login. Listeners are awaited in
 *    registration order; a throw surfaces to whoever called emit(). Use for
 *    side effects that may need to block/fail the triggering request.
 *
 *  - Filter/collector events (`filter` / `collect`): "give me content to
 *    render" — navigation items, injected head/body/footer markup, page
 *    content blocks. Every listener's return value is gathered into a flat
 *    array (Laravel's `pages.home` / `head` hooks work the same way: each
 *    listener returns a value, the framework merges them all).
 *
 * Core code calls emit()/collect(); addons call on()/filter() from their
 * register(ctx) — see server/addons/types.ts.
 */

// Models that fire Created/Updated/Deleted, mirroring the reference app's
// per-model event list but mapped onto this panel's actual domain objects.
const CRUD_MODELS = [
  'user',
  'server',
  'node',
  'egg',
  'allocation',
  'apiKey',
  'backup',
  'schedule',
  'sshKey',
  'mount',
  'database',
  'setting',
] as const;
type CrudModel = (typeof CRUD_MODELS)[number];

interface CrudPayload {
  id: string;
  [key: string]: unknown;
}

type CrudActionHooks = {
  [M in CrudModel as `${M}.created`]: CrudPayload;
} & {
  [M in CrudModel as `${M}.updated`]: CrudPayload;
} & {
  [M in CrudModel as `${M}.deleted`]: CrudPayload;
};

export interface ActionHooks extends CrudActionHooks {
  'auth.login': { userId: string };
  'auth.logout': { userId: string };
}

export interface NavigationItem {
  name: string;
  url: string;
  priority?: number;
}

export interface PageContentBlock {
  html: string;
}

export interface FilterHooks {
  navigation: NavigationItem;
  'navigation.dashboard': NavigationItem;
  'navigation.account-dropdown': NavigationItem;
  'pages.home': PageContentBlock;
  head: string;
  body: string;
  footer: string;
}

type ActionListener<T> = (payload: T) => void | Promise<void>;
type FilterListener<T> = () => T | T[] | undefined | Promise<T | T[] | undefined>;

class HookBus {
  private actionListeners = new Map<string, Set<ActionListener<unknown>>>();
  private filterListeners = new Map<string, Set<FilterListener<unknown>>>();

  /** Subscribe to an action event ("this happened"). Returns an unsubscribe fn. */
  on<K extends keyof ActionHooks | (string & {})>(
    event: K,
    listener: ActionListener<K extends keyof ActionHooks ? ActionHooks[K] : unknown>,
  ): () => void {
    const set = this.actionListeners.get(event as string) ?? new Set();
    set.add(listener as ActionListener<unknown>);
    this.actionListeners.set(event as string, set);
    return () => set.delete(listener as ActionListener<unknown>);
  }

  /** Fire an action event. Listeners run sequentially and are awaited. */
  async emit<K extends keyof ActionHooks | (string & {})>(
    event: K,
    payload: K extends keyof ActionHooks ? ActionHooks[K] : unknown,
  ): Promise<void> {
    const set = this.actionListeners.get(event as string);
    if (!set || set.size === 0) return;
    for (const listener of set) {
      await listener(payload);
    }
  }

  /** Subscribe to a filter/collector event ("give me content"). */
  filter<K extends keyof FilterHooks | (string & {})>(
    event: K,
    listener: FilterListener<K extends keyof FilterHooks ? FilterHooks[K] : unknown>,
  ): () => void {
    const set = this.filterListeners.get(event as string) ?? new Set();
    set.add(listener as FilterListener<unknown>);
    this.filterListeners.set(event as string, set);
    return () => set.delete(listener as FilterListener<unknown>);
  }

  /** Collects every listener's return value into one flat array (undefined dropped). */
  async collect<K extends keyof FilterHooks | (string & {})>(
    event: K,
  ): Promise<Array<K extends keyof FilterHooks ? FilterHooks[K] : unknown>> {
    const set = this.filterListeners.get(event as string);
    if (!set || set.size === 0) return [];

    const results: unknown[] = [];
    for (const listener of set) {
      const value = await listener();
      if (value === undefined) continue;
      if (Array.isArray(value)) results.push(...value);
      else results.push(value);
    }
    return results as Array<K extends keyof FilterHooks ? FilterHooks[K] : unknown>;
  }
}

let bus: HookBus | null = null;

export function useHooks(): HookBus {
  if (!bus) bus = new HookBus();
  return bus;
}
