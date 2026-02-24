import { onMounted, onUnmounted, ref, getCurrentInstance, watch, type ComputedRef } from 'vue';
import type { ServerStats, ServerState } from '#shared/types/server';
import type {
  ServerEventDetails,
  WebSocketMessage,
  WingsStatsPayload,
} from '#shared/types/websocket';

const MAX_HISTORY_POINTS = 60;
const RECONNECT_BASE_DELAY = 5000;
const RECONNECT_MAX_DELAY = 60000;
const MAX_RECONNECT_ATTEMPTS = 10;

const websocketInstances = new Map<
  string,
  {
    logs: string[];
    connected: boolean;
    serverState: ServerState;
    stats: ServerStats | null;
    statsHistory: Array<{ timestamp: number; stats: ServerStats }>;
    error: string | null;
  }
>();

function getOrCreateInstance(serverId: string) {
  if (!websocketInstances.has(serverId)) {
    websocketInstances.set(serverId, {
      logs: [],
      connected: false,
      serverState: 'offline',
      stats: null,
      statsHistory: [],
      error: null,
    });
  }
  return websocketInstances.get(serverId)!;
}

const allowedServerStates = [
  'offline',
  'starting',
  'stopping',
  'running',
  'stopped',
] as const satisfies readonly ServerState[];

const isServerState = (value: unknown): value is ServerState =>
  typeof value === 'string' && (allowedServerStates as readonly string[]).includes(value);

const coerceServerState = (value: unknown): ServerState => {
  return isServerState(value) ? value : 'offline';
};

function mapWingsStats(payload: WingsStatsPayload): ServerStats {
  const network = payload.network || {};
  return {
    memoryBytes: Number(payload.memory_bytes ?? payload.memory ?? 0),
    memoryLimitBytes: Number(payload.memory_limit_bytes ?? payload.memory_limit ?? 0),
    cpuAbsolute: Number(payload.cpu_absolute ?? payload.cpu ?? 0),
    diskBytes: Number(payload.disk_bytes ?? payload.disk ?? 0),
    uptime: Number(payload.uptime ?? 0),
    state: coerceServerState(payload.state ?? payload.status),
    networkRxBytes: Number(network.rx_bytes ?? payload.network_rx_bytes ?? 0),
    networkTxBytes: Number(network.tx_bytes ?? payload.network_tx_bytes ?? 0),
  };
}

function normalizeMessageArgs(args?: unknown[]): string[] {
  if (!args) return [];

  return args
    .map((value) => {
      if (typeof value === 'string') {
        return value;
      }

      if (value == null) {
        return '';
      }

      try {
        return JSON.stringify(value);
      } catch {
        return '';
      }
    })
    .filter((value): value is string => value.length > 0);
}

function formatRawArgs(args?: unknown[]): string | undefined {
  const lines = normalizeMessageArgs(args);
  return lines.length > 0 ? lines.join('\n') : undefined;
}

export function useServerWebSocket(serverId: string | ComputedRef<string>) {
  const { t } = useI18n();
  const nuxtApp = useNuxtApp();
  const runtimeConfig = useRuntimeConfig();
  const appDisplayName = runtimeConfig.public?.appName || 'XyraPanel';
  const appShellHost = appDisplayName.replace(/\s+/g, '').toLowerCase();
  const PRIMARY_TERMINAL_COLOR = '\u001b[38;2;59;130;246m';
  const RESET = '\u001b[0m';
  const TERMINAL_PRELUDE = `\u001b[1m${PRIMARY_TERMINAL_COLOR}container@${appShellHost}~ ${RESET}`;
  const DAEMON_LABEL = `${PRIMARY_TERMINAL_COLOR}[${appDisplayName} Daemon]${RESET}`;
  const ESC = '\u001b';
  const CONTAINER_PROMPT_PATTERN = new RegExp(
    `(?:${ESC}\\[[0-9;]*m)*(?:container(?:@[A-Za-z0-9._-]+)?~)`,
    'gi',
  );

  const actualServerId = typeof serverId === 'string' ? serverId : serverId.value;
  const defaultState = {
    logs: [] as string[],
    connected: false,
    serverState: 'offline' as ServerState,
    stats: null as ServerStats | null,
    statsHistory: [] as Array<{ timestamp: number; stats: ServerStats }>,
    error: null as string | null,
  };
  const persistentState = import.meta.client ? getOrCreateInstance(actualServerId) : defaultState;
  const usePersistedState = import.meta.client && !nuxtApp.isHydrating;
  const initialState = usePersistedState ? persistentState : defaultState;
  const socket = ref<WebSocket | null>(null);
  const connecting = ref(false);
  const connected = ref(initialState.connected);
  const serverState = ref<ServerState>(initialState.serverState);
  const stats = ref<ServerStats | null>(initialState.stats);
  const statsHistory = ref<Array<{ timestamp: number; stats: ServerStats }>>([
    ...initialState.statsHistory,
  ]);
  const logs = ref<string[]>([...initialState.logs]);
  const error = ref<string | null>(initialState.error);

  watch(connected, (val) => {
    persistentState.connected = val;
  });
  watch(serverState, (val) => {
    persistentState.serverState = val;
  });
  watch(stats, (val) => {
    persistentState.stats = val;
  });
  watch(
    statsHistory,
    (val) => {
      persistentState.statsHistory = [...val];
    },
    { deep: true },
  );
  watch(
    logs,
    (val) => {
      persistentState.logs = [...val];
    },
    { deep: true },
  );
  watch(error, (val) => {
    persistentState.error = val;
  });

  const currentToken = ref<string | null>(null);
  const currentSocketUrl = ref<string | null>(null);
  const tokenRefreshInFlight = ref(false);
  const reconnectTimer = ref<ReturnType<typeof setTimeout> | null>(null);
  const lifecycleStatus = ref<'normal' | 'installing' | 'transferring' | 'restoring' | 'error'>(
    'normal',
  );
  const lifecycleMessage = ref<string>('');
  const lifecycleProgress = ref<number | null>(null);

  const recentEvents = ref<ServerEventDetails[]>([]);

  let intentionalClose = false;
  let reconnectAfterClose = false;
  let disposed = false;
  let reconnectAttempts = 0;

  const recordEvent = (details: ServerEventDetails) => {
    recentEvents.value.unshift(details);
    if (recentEvents.value.length > 100) {
      recentEvents.value.pop();
    }
  };

  const clearLifecycle = () => {
    lifecycleStatus.value = 'normal';
    lifecycleMessage.value = '';
    lifecycleProgress.value = null;
  };

  const setLifecycle = (
    status: typeof lifecycleStatus.value,
    message?: string,
    progress?: number | null,
  ) => {
    lifecycleStatus.value = status;
    lifecycleMessage.value = message ?? '';
    lifecycleProgress.value = typeof progress === 'number' ? progress : null;
  };

  const clearReconnectTimer = () => {
    if (reconnectTimer.value !== null) {
      clearTimeout(reconnectTimer.value);
      reconnectTimer.value = null;
    }
  };

  const scheduleReconnect = (delay?: number) => {
    if (disposed || reconnectTimer.value !== null || !import.meta.client) {
      return;
    }

    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.warn(
        `[WebSocket] Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached, giving up`,
      );
      error.value = t('server.websocket.connectionFailed');
      return;
    }

    const backoff =
      delay ?? Math.min(RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttempts), RECONNECT_MAX_DELAY);
    reconnectAttempts++;
    console.log(`[WebSocket] Scheduling reconnect #${reconnectAttempts} in ${backoff}ms`);

    reconnectTimer.value = setTimeout(() => {
      reconnectTimer.value = null;
      void connect();
    }, backoff);
  };

  const send = (event: string, args: string[] = []) => {
    if (!socket.value || socket.value.readyState !== WebSocket.OPEN) {
      console.warn(
        `[WebSocket] Cannot send ${event}: socket not open (state: ${socket.value?.readyState})`,
      );
      return;
    }

    const message = JSON.stringify({ event, args });
    console.log(`[WebSocket] Sending: ${event}`, args.length > 0 ? `with ${args.length} args` : '');
    socket.value.send(message);
  };

  const sendAuthenticate = (token: string | null) => {
    if (!token) {
      return;
    }

    send('auth', [token]);
  };

  const brandConsoleLine = (line: string) => {
    return line
      .replace(/\[(?:Pterodactyl|Wings) Daemon\]/gi, DAEMON_LABEL)
      .replace(CONTAINER_PROMPT_PATTERN, TERMINAL_PRELUDE);
  };

  const handleConsoleOutput = (args?: unknown[] | string[]) => {
    let normalized: string[];
    if (
      Array.isArray(args) &&
      args.length > 0 &&
      typeof args[0] === 'string' &&
      args[0].includes('\u001b')
    ) {
      normalized = (args as unknown[]).filter((item): item is string => typeof item === 'string');
    } else {
      normalized = normalizeMessageArgs(args);
    }

    if (normalized.length > 0) {
      if (import.meta.dev) {
        const lineCount = normalized.length;
        const previewLines = normalized.slice(0, 2).map((l) => l.substring(0, 50));
        console.log('[WebSocket] Console output:', lineCount, 'line(s)', previewLines);
      }
      normalized.forEach((line) => {
        const brandedLine = brandConsoleLine(line);
        logs.value.push(brandedLine);
        if (logs.value.length > 1000) {
          logs.value.shift();
        }
      });
      logs.value = [...logs.value];
    }
  };

  const handleStats = (raw: string) => {
    try {
      const parsed = parseJson<WingsStatsPayload>(
        raw,
        (data): data is WingsStatsPayload => typeof data === 'object' && data !== null,
      );
      if (parsed) {
        const mapped = mapWingsStats(parsed);
        stats.value = mapped;
        serverState.value = mapped.state;

        statsHistory.value.push({
          timestamp: Date.now(),
          stats: mapped,
        });

        if (statsHistory.value.length > MAX_HISTORY_POINTS) {
          statsHistory.value.shift();
        }
      }
    } catch (err) {
      console.error('Failed to parse stats payload:', err);
    }
  };

  const handleMessage = (message: WebSocketMessage) => {
    switch (message.event) {
      case 'auth success':
        console.log('[WebSocket] Authentication successful, requesting logs and stats');
        connected.value = true;
        error.value = null;
        reconnectAttempts = 0;
        send('send logs', []);
        send('send stats', []);
        console.log('[WebSocket] Waiting for console output events from Wings...');
        break;

      case 'auth failed':
        connected.value = false;
        error.value = t('server.websocket.authenticationFailed');
        break;

      case 'status':
        {
          const stateArg = message.args?.[0];
          if (typeof stateArg === 'string') {
            const previousState = serverState.value;
            serverState.value = coerceServerState(stateArg);
            recordEvent({ event: 'status', message: stateArg, timestamp: Date.now() });

            if (previousState !== stateArg) {
              const powerMessage = TERMINAL_PRELUDE + `Server marked as ${stateArg}...\u001b[0m`;
              handleConsoleOutput([powerMessage]);
            }

            if (stateArg === 'running' && lifecycleStatus.value !== 'normal') {
              clearLifecycle();
            }
          } else {
            recordEvent({
              event: 'status',
              raw: formatRawArgs(message.args),
              timestamp: Date.now(),
            });
          }
        }
        break;

      case 'console output':
      case 'install output':
        {
          const rawLines = normalizeMessageArgs(message.args);
          if (rawLines.length > 0) {
            const eventName = message.event;
            const lineCount = rawLines.length;
            const preview = rawLines
              .slice(0, 2)
              .map((l) => l.substring(0, 80))
              .join(' | ');
            console.log('[WebSocket] Received', eventName, '(', lineCount, 'line(s)):', preview);
            handleConsoleOutput(message.args);
            recordEvent({ event: message.event, raw: rawLines.join('\n'), timestamp: Date.now() });
            if (message.event === 'install output') {
              const lastLine = rawLines[rawLines.length - 1];
              if (lastLine) {
                setLifecycle('installing', lastLine);
              }
            }
          } else {
            const eventName = message.event;
            console.warn('[WebSocket] Received', eventName, 'but no lines in args:', message.args);
          }
        }
        break;

      case 'daemon message':
        {
          const rawLines = normalizeMessageArgs(message.args);
          if (rawLines.length > 0) {
            console.log(`[WebSocket] Received daemon message (${rawLines.length} line(s))`);
            const linesWithPrelude = rawLines.map(
              (line) => TERMINAL_PRELUDE + line.replace(/(?:\r\n|\r|\n)$/im, '') + '\u001b[0m',
            );
            handleConsoleOutput(linesWithPrelude);
            recordEvent({ event: message.event, raw: rawLines.join('\n'), timestamp: Date.now() });
            if (rawLines[0]) {
              error.value = rawLines[0];
            }
          }
        }
        break;

      case 'daemon error':
        {
          const rawLines = normalizeMessageArgs(message.args);
          if (rawLines.length > 0) {
            console.log(`[WebSocket] Received daemon error (${rawLines.length} line(s))`);
            const linesWithFormatting = rawLines.map(
              (line) =>
                TERMINAL_PRELUDE +
                '\u001b[1m\u001b[41m' +
                line.replace(/(?:\r\n|\r|\n)$/im, '') +
                '\u001b[0m',
            );
            handleConsoleOutput(linesWithFormatting);
            recordEvent({ event: message.event, raw: rawLines.join('\n'), timestamp: Date.now() });
            if (rawLines[0]) {
              error.value = rawLines[0];
            }
          }
        }
        break;

      case 'install started':
        setLifecycle('installing', t('server.websocket.installationInProgress'));
        recordEvent({ event: 'install started', timestamp: Date.now() });
        break;

      case 'install completed':
        recordEvent({ event: 'install completed', timestamp: Date.now() });
        setLifecycle('normal', t('server.websocket.installationCompleted'));
        break;

      case 'transfer status':
        {
          const raw = message.args?.[0];
          if (typeof raw === 'string') {
            const payload = parseJson<{ progress?: number; status?: string; message?: string }>(
              raw,
              (data): data is { progress?: number; status?: string; message?: string } =>
                typeof data === 'object' && data !== null,
            );
            if (payload) {
              if (typeof payload.status === 'string') {
                setLifecycle('transferring', payload.status);
              } else if (typeof payload.message === 'string') {
                setLifecycle('transferring', payload.message);
              }
              if (typeof payload.progress === 'number') {
                setLifecycle('transferring', lifecycleMessage.value, payload.progress);
              }
            }
          }
        }
        break;

      case 'transfer logs':
        {
          const raw = formatRawArgs(message.args);
          if (raw) {
            recordEvent({ event: 'transfer logs', raw, timestamp: Date.now() });
          }
        }
        break;

      case 'backup restore completed':
        {
          const raw = message.args?.[0];
          if (typeof raw === 'string') {
            const payload = parseJson<{ successful?: boolean; message?: string }>(
              raw,
              (data): data is { successful?: boolean; message?: string } =>
                typeof data === 'object' && data !== null,
            );
            if (payload?.successful === false) {
              setLifecycle('error', payload.message ?? t('server.websocket.backupRestoreFailed'));
            } else {
              setLifecycle('normal', t('server.websocket.backupRestoreFinished'));
            }
            recordEvent({ event: 'backup restore completed', raw, timestamp: Date.now() });
          } else {
            setLifecycle('normal', t('server.websocket.backupRestoreFinished'));
            recordEvent({ event: 'backup restore completed', timestamp: Date.now() });
          }
        }
        break;

      case 'backup completed':
        {
          const raw = formatRawArgs(message.args);
          setLifecycle('normal', t('server.websocket.backupCompleted'));
          recordEvent({ event: 'backup completed', raw, timestamp: Date.now() });
        }
        break;

      case 'stats':
        {
          const raw = message.args?.[0];
          if (typeof raw === 'string') {
            handleStats(raw);
          }
        }
        break;

      case 'token expiring':
        void refreshToken(false);
        break;

      case 'token expired':
        connected.value = false;
        void refreshToken(true);
        break;

      default:
        if (message.event) {
          recordEvent({
            event: message.event,
            raw: formatRawArgs(message.args),
            timestamp: Date.now(),
          });
        }
    }
  };

  const handleOpen = () => {
    sendAuthenticate(currentToken.value);
  };

  const handleError = (event: Event) => {
    console.error('WebSocket error', event);
    const errorMessage = t('server.websocket.connectionError');
    if (!error.value || error.value === t('server.websocket.connecting')) {
      error.value = errorMessage;
    }
  };

  const handleClose = (event?: CloseEvent) => {
    socket.value = null;
    connected.value = false;
    connecting.value = false;

    if (disposed) {
      return;
    }

    if (event) {
      let closeMessage: string | null = null;

      if (event.code === 1006) {
        closeMessage = t('server.websocket.connectionClosedAbnormally');
      } else if (event.code === 1002) {
        closeMessage = t('server.websocket.protocolError');
      } else if (event.code === 1003) {
        closeMessage = t('server.websocket.invalidDataReceived');
      } else if (event.code === 1008) {
        closeMessage = t('server.websocket.policyViolation');
      } else if (event.code === 1011) {
        closeMessage = t('server.websocket.serverError');
      } else if (event.code === 1000 || event.code === 1001) {
        // Normal closure, don't set error
      } else if (event.reason) {
        closeMessage = t('server.websocket.connectionClosedWithReason', { reason: event.reason });
      } else if (event.code !== 1000 && event.code !== 1001) {
        closeMessage = t('server.websocket.connectionClosedWithCode', { code: event.code });
      }

      if (closeMessage && (!error.value || error.value === t('server.websocket.connecting'))) {
        error.value = closeMessage;
      }
      console.error('WebSocket closed:', {
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean,
      });
    } else {
      // No close event, connection was likely aborted
      if (!error.value || error.value === t('server.websocket.connecting')) {
        error.value = t('server.websocket.connectionClosed');
      }
    }

    if (reconnectAfterClose) {
      reconnectAfterClose = false;
      scheduleReconnect(0);
    } else if (!intentionalClose && (!event || (event.code !== 1000 && event.code !== 1001))) {
      scheduleReconnect();
    }

    intentionalClose = false;
  };

  const attachSocketHandlers = (ws: WebSocket) => {
    ws.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        if (message.event !== 'console output' && message.event !== 'stats') {
          console.log(
            '[WebSocket] Received message:',
            message.event,
            message.args?.length || 0,
            'args',
          );
        }
        handleMessage(message);
      } catch (err) {
        console.error(
          '[WebSocket] Failed to parse Wings message:',
          err,
          'Raw data:',
          event.data?.substring(0, 200),
        );
      }
    };

    ws.onerror = handleError;
    ws.onclose = (event) => handleClose(event);
  };

  const refreshToken = async (forceReconnect: boolean) => {
    if (tokenRefreshInFlight.value) {
      return;
    }

    tokenRefreshInFlight.value = true;
    try {
      const credentials = await $fetch<{
        token?: string;
        socket?: string;
        unavailable?: boolean;
        message?: string;
      }>(`/api/client/servers/${actualServerId}/websocket`);

      if (credentials?.unavailable === true) {
        error.value = credentials.message || t('server.websocket.failedToRefreshToken');
        return;
      }

      if (!credentials?.token || !credentials?.socket) {
        throw new Error(t('server.websocket.invalidCredentials'));
      }

      currentToken.value = credentials.token;

      if (currentSocketUrl.value && currentSocketUrl.value !== credentials.socket) {
        currentSocketUrl.value = credentials.socket;
        reconnect();
        return;
      }

      if (socket.value && socket.value.readyState === WebSocket.OPEN) {
        sendAuthenticate(credentials.token);
      } else if (forceReconnect) {
        reconnect();
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : t('server.websocket.failedToRefreshToken');
      error.value = errorMessage;
      if (forceReconnect) {
        reconnect();
      }
    } finally {
      tokenRefreshInFlight.value = false;
    }
  };

  const connect = async () => {
    if (connecting.value || disposed || !import.meta.client) {
      return;
    }

    connecting.value = true;
    clearReconnectTimer();
    connected.value = false;
    error.value = t('server.websocket.connecting');

    try {
      console.log(`[WebSocket] Fetching credentials for server ${actualServerId}`);

      if (!import.meta.client) {
        throw new Error(t('server.websocket.clientSideOnly'));
      }

      let credentials: { token: string; socket: string } | null = null;

      try {
        const url = `/api/client/servers/${actualServerId}/websocket`;
        const response = await fetch(url, {
          credentials: 'include',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
        });

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          const text = await response.text();
          console.error(`[WebSocket] Non-JSON response (${contentType}):`, text.substring(0, 200));
          if (text.includes('<!DOCTYPE html>') || text.includes('<html')) {
            throw new Error(t('server.websocket.serverReturnedHTML'));
          }
          throw new Error(t('server.websocket.serverReturnedNonJSON', { contentType }));
        }

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({
            message: `HTTP ${response.status} ${response.statusText}`,
          }));
          throw new Error(errorData.message || `HTTP ${response.status} ${response.statusText}`);
        }

        const responseData = await response.json();

        if (responseData?.unavailable === true) {
          connecting.value = false;
          error.value = responseData?.message || t('server.websocket.failedToFetchCredentials');
          return;
        }

        if (responseData?.data?.unavailable === true) {
          connecting.value = false;
          error.value =
            responseData?.data?.message || t('server.websocket.failedToFetchCredentials');
          return;
        }

        if (responseData.data && responseData.data.token && responseData.data.socket) {
          credentials = {
            token: responseData.data.token,
            socket: responseData.data.socket,
          };
        } else if (responseData.token && responseData.socket) {
          credentials = {
            token: responseData.token,
            socket: responseData.socket,
          };
        } else {
          throw new Error(t('server.websocket.invalidResponseFormat'));
        }
      } catch (fetchError: unknown) {
        const fetchErrObj =
          typeof fetchError === 'object' && fetchError !== null
            ? (fetchError as { message?: string; data?: unknown })
            : { message: String(fetchError), data: undefined };
        const errorMessage = fetchErrObj.message || '';
        const errorData = fetchErrObj.data;
        const isUnavailable = errorMessage
          .toLowerCase()
          .includes('not available on the assigned wings node');

        if (!isUnavailable) {
          console.error(`[WebSocket] Fetch error:`, fetchError);
        }

        if (
          errorData &&
          typeof errorData === 'string' &&
          (errorData.includes('<!DOCTYPE html>') || errorData.includes('<html'))
        ) {
          throw new Error(t('server.websocket.serverReturnedHTML'));
        }

        if (errorMessage.includes('<!DOCTYPE html>') || errorMessage.includes('<html')) {
          throw new Error(t('server.websocket.serverReturnedHTML'));
        }

        // $fetch throws H3Error objects for non-2xx responses
        if (errorData && typeof errorData === 'object' && errorData !== null) {
          const msg = (errorData as { message?: unknown }).message;
          if (typeof msg === 'string') {
            throw new Error(
              msg || fetchErrObj.message || t('server.websocket.failedToFetchCredentials'),
            );
          }
        }

        if (fetchError instanceof Error && fetchError.message.includes('HTML instead of JSON')) {
          throw fetchError;
        }

        throw new Error(fetchErrObj.message || t('server.websocket.failedToFetchCredentials'));
      }

      if (
        !credentials ||
        typeof credentials.socket !== 'string' ||
        typeof credentials.token !== 'string'
      ) {
        console.error(`[WebSocket] Invalid credentials structure:`, {
          hasSocket: !!credentials?.socket,
          hasToken: !!credentials?.token,
          socketType: typeof credentials?.socket,
          tokenType: typeof credentials?.token,
          credentials,
        });
        throw new Error(t('server.websocket.invalidCredentials'));
      }

      console.log(
        `[WebSocket] Got credentials, socket URL: ${credentials.socket.substring(0, 50)}...`,
      );

      currentToken.value = credentials.token;
      currentSocketUrl.value = credentials.socket;

      if (socket.value) {
        intentionalClose = true;
        reconnectAfterClose = false;
        socket.value.close();
      }

      let wsUrl = credentials.socket;
      if (window.location.protocol === 'https:' && wsUrl.startsWith('ws://')) {
        wsUrl = `wss://${wsUrl.slice('ws://'.length)}`;
        console.log('[WebSocket] Upgraded insecure socket URL to wss:// due to HTTPS page context');
      }

      console.log(
        `[WebSocket] Connecting to: ${wsUrl.length > 80 ? wsUrl.substring(0, 80) + '...' : wsUrl}`,
      );

      if (typeof WebSocket === 'undefined') {
        throw new Error(t('server.websocket.notAvailable'));
      }

      const ws = new WebSocket(wsUrl);
      socket.value = ws;

      let connectionTimeout: ReturnType<typeof setTimeout> | null = null;
      let hasOpened = false;

      connectionTimeout = setTimeout(() => {
        if (!hasOpened && ws.readyState !== WebSocket.OPEN) {
          console.error('[WebSocket] Connection timeout after 10s, state:', ws.readyState);
          connecting.value = false;
          error.value = t('server.websocket.connectionTimeout');
          intentionalClose = true;
          if (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN) {
            ws.close();
          }
          scheduleReconnect();
        }
      }, 10000);

      ws.onopen = () => {
        console.log('[WebSocket] Connection opened successfully');
        hasOpened = true;
        if (connectionTimeout) {
          clearTimeout(connectionTimeout);
          connectionTimeout = null;
        }
        connecting.value = false;
        error.value = null;
        handleOpen();
      };

      attachSocketHandlers(ws);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : t('server.websocket.failedToEstablish');
      const isUnavailable = errorMessage
        .toLowerCase()
        .includes('not available on the assigned wings node');

      if (!isUnavailable) {
        console.error('[WebSocket] Failed to get credentials:', err);
      }

      connecting.value = false;
      error.value = errorMessage;
      if (
        !errorMessage.includes('404') &&
        !errorMessage.includes('401') &&
        !errorMessage.includes('403') &&
        !isUnavailable
      ) {
        scheduleReconnect();
      }
    }
  };

  const disconnect = (reconnectSoon = false) => {
    clearReconnectTimer();
    reconnectAfterClose = reconnectSoon;
    intentionalClose = !reconnectSoon;
    if (!reconnectSoon) {
      reconnectAttempts = 0;
    }

    if (socket.value) {
      socket.value.close();
    }

    if (!reconnectSoon) {
      socket.value = null;
      connected.value = false;
    }
  };

  const reconnect = () => {
    reconnectAttempts = 0;
    if (socket.value) {
      disconnect(true);
    } else {
      clearReconnectTimer();
      scheduleReconnect(0);
    }
  };

  const sendCommand = (command: string) => {
    if (!command.trim()) {
      console.warn('[WebSocket] Attempted to send empty command');
      return;
    }
    console.log(`[WebSocket] Sending command to Wings: "${command}"`);
    console.log(`[WebSocket] Socket state:`, {
      hasSocket: !!socket.value,
      readyState: socket.value?.readyState,
      isOpen: socket.value?.readyState === WebSocket.OPEN,
      connected: connected.value,
    });
    send('send command', [command]);
  };

  const sendPowerAction = (action: string) => {
    send('set state', [action]);
  };

  if (typeof serverId !== 'string' && import.meta.client) {
    watch(serverId, (newId, oldId) => {
      if (newId !== oldId && newId) {
        console.log(`[WebSocket] Server ID changed from ${oldId} to ${newId}, reconnecting...`);
        disconnect(true);
      }
    });
  }

  if (import.meta.client) {
    const instance = getCurrentInstance();
    if (instance) {
      onMounted(() => {
        void connect();
      });

      onUnmounted(() => {
        disposed = true;
        clearReconnectTimer();
        disconnect(false);
      });
    }
  }

  return {
    connected,
    connecting,
    serverState,
    stats,
    statsHistory,
    logs,
    error,
    sendCommand,
    sendPowerAction,
    reconnect,
    lifecycleStatus,
    lifecycleMessage,
    lifecycleProgress,
    recentEvents,
  };
}

function parseJson<T>(value: string, guard: (data: unknown) => data is T): T | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!guard(parsed)) {
      return null;
    }
    return parsed;
  } catch (error) {
    console.warn('Failed to parse JSON payload', error);
    return null;
  }
}
