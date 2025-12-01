<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import type { ServerTerminalProps } from '#shared/types/server'
import type { Terminal } from 'xterm'

const { t } = useI18n()

const props = defineProps<ServerTerminalProps>()
defineEmits<{
  command: [command: string]
}>()

const terminalRef = ref<HTMLElement | null>(null)
let terminal: Terminal | null = null
let fitAddon: import('xterm-addon-fit').FitAddon | null = null
let searchAddon: import('xterm-addon-search').SearchAddon | null = null
let searchBarAddon: { dispose: () => void } | null = null
let webLinksAddon: import('xterm-addon-web-links').WebLinksAddon | null = null
let lastProcessedLogCount = 0

const HISTORY_KEY = `server-${props.serverId || 'default'}:command_history`
const MAX_HISTORY = 32
let commandHistory: string[] = []
let _historyIndex = -1

if (import.meta.client) {
  try {
    const stored = localStorage.getItem(HISTORY_KEY)
    if (stored) {
      commandHistory = JSON.parse(stored)
    }
  } catch (e) {
    console.warn('[XTerminal] Failed to load command history:', e)
  }
}

function saveHistory() {
  if (import.meta.client) {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(commandHistory))
    } catch (e) {
      console.warn('[XTerminal] Failed to save command history:', e)
    }
  }
}

function _addToHistory(command: string) {
  if (!command.trim()) return
  
  const index = commandHistory.indexOf(command)
  if (index > -1) {
    commandHistory.splice(index, 1)
  }
  
  commandHistory.unshift(command)
  
  if (commandHistory.length > MAX_HISTORY) {
    commandHistory = commandHistory.slice(0, MAX_HISTORY)
  }
  
  saveHistory()
  _historyIndex = -1 
}

const writeToTerminal = (text: string) => {
  if (terminal) {
    terminal.write(text)
  }
}

function handleTerminalClick() {
  if (terminal) {
    terminal.focus()
  }
}

const theme = {
  background: '#000000',
  foreground: '#d0d0d0',
  cursor: 'transparent',
  black: '#000000',
  red: '#E54B4B',
  green: '#9ECE58',
  yellow: '#FAED70',
  blue: '#396FE2',
  magenta: '#BB80B3',
  cyan: '#2DDAFD',
  white: '#d0d0d0',
  brightBlack: 'rgba(255, 255, 255, 0.2)',
  brightRed: '#FF5370',
  brightGreen: '#C3E88D',
  brightYellow: '#FFCB6B',
  brightBlue: '#82AAFF',
  brightMagenta: '#C792EA',
  brightCyan: '#89DDFF',
  brightWhite: '#ffffff',
  selection: '#FAF089',
}

let resizeObserverRef: ResizeObserver | null = null

onUnmounted(() => {
  resizeObserverRef?.disconnect()
  resizeObserverRef = null
  if (fitAddon) {
    // ResizeObserver cleanup is handled by disconnect
  }
  terminal?.dispose()
  terminal = null
  fitAddon = null
  searchAddon = null
  webLinksAddon = null
})

onMounted(async () => {
  if (!terminalRef.value) return

  const { Terminal } = await import('xterm')
  const { FitAddon } = await import('xterm-addon-fit')
  const { SearchAddon } = await import('xterm-addon-search')
  const { WebLinksAddon } = await import('xterm-addon-web-links')
  await import('xterm/css/xterm.css')
  
  terminal = new Terminal({
    theme,
    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
    fontSize: 12,
    lineHeight: 1.2,
    cursorBlink: true,
    cursorStyle: 'underline',
    allowTransparency: true,
    scrollback: 5000,
    disableStdin: true, 
  })

  fitAddon = new FitAddon()
  searchAddon = new SearchAddon()
  webLinksAddon = new WebLinksAddon()

  terminal.loadAddon(fitAddon)
  terminal.loadAddon(searchAddon)
  terminal.loadAddon(webLinksAddon)
  
  try {
    const searchBarModule = await import('xterm-addon-search-bar')
    type SearchBarModule = {
      SearchAddonBar?: new (options: { searchAddon: import('xterm-addon-search').SearchAddon }) => { dispose: () => void }
      default?: {
        SearchAddonBar?: new (options: { searchAddon: import('xterm-addon-search').SearchAddon }) => { dispose: () => void }
      } | (new (options: { searchAddon: import('xterm-addon-search').SearchAddon }) => { dispose: () => void })
    }
    const module = searchBarModule as SearchBarModule
    const SearchAddonBar = module.SearchAddonBar || (module.default && ('SearchAddonBar' in module.default ? module.default.SearchAddonBar : module.default as typeof module.default))
    if (SearchAddonBar) {
      searchBarAddon = new SearchAddonBar({ searchAddon })
      terminal.loadAddon(searchBarAddon)
    }
  } catch (e) {
    if (import.meta.dev) {
      console.warn('[XTerminal] SearchAddonBar not available:', e)
    }
  }

  terminal.open(terminalRef.value)
  fitAddon.fit()

  terminal.onWriteParsed(() => {
    if (terminal) {
      terminal.refresh(0, terminal.rows - 1)
    }
  })

  terminal.focus()

  if (terminalRef.value) {
    terminalRef.value.addEventListener('click', () => {
      if (terminal) terminal.focus()
    })
  }

  terminal.attachCustomKeyEventHandler((e: KeyboardEvent) => {
    // Ctrl+F or Cmd+F: Open search
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault()
      if (searchBarAddon && typeof searchBarAddon.show === 'function') {
        searchBarAddon.show()
      } else if (searchAddon) {
        if (import.meta.client && typeof globalThis !== 'undefined' && 'prompt' in globalThis) {
          const searchTerm = (globalThis as { prompt?: (message: string) => string | null }).prompt?.(t('server.console.searchTerminal'))
          if (searchTerm) {
            searchAddon.findNext(searchTerm)
          }
        }
      }
      return false
    }
    if (e.key === 'Escape' && searchBarAddon && typeof searchBarAddon.hide === 'function') {
      searchBarAddon.hide()
      return false
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'c' && terminal?.hasSelection()) {
      return true
    }
    return true
  })

  const resizeObserver = new ResizeObserver(() => {
    fitAddon?.fit()
  })
  resizeObserver.observe(terminalRef.value)

  resizeObserverRef = resizeObserver

  console.log(`[XTerminal] Terminal mounted, logs prop:`, {
    isArray: Array.isArray(props.logs),
    length: props.logs?.length || 0,
    type: typeof props.logs,
    value: props.logs,
    firstFew: Array.isArray(props.logs) ? props.logs.slice(0, 3) : 'not an array',
  })
  
  if (Array.isArray(props.logs)) {
    lastProcessedLogCount = props.logs.length
    if (props.logs.length > 0) {
      console.log(`[XTerminal] Initializing with ${props.logs.length} existing logs`)
      props.logs.forEach((log, index) => {
        if (typeof log !== 'string') {
          console.error(`[XTerminal] Log ${index} is not a string:`, typeof log, log)
          return
        }
        writeToTerminal(log + '\r\n')
        if (index < 3) {
          console.log(`[XTerminal]   Initial log ${index + 1}:`, log.substring(0, 100))
        }
      })
      console.log(`[XTerminal] Finished writing ${props.logs.length} logs to terminal`)
    } else {
      console.log(`[XTerminal] No logs to initialize (empty array)`)
    }
  } else {
    console.log(`[XTerminal] Logs prop is not an array:`, typeof props.logs)
    lastProcessedLogCount = 0
  }
})

watch(() => props.logs, (newLogs) => {
  if (!terminal) {
    console.warn('[XTerminal] Terminal not initialized, cannot write logs')
    return
  }

  if (!Array.isArray(newLogs)) {
    console.error('[XTerminal] Logs is not an array!', typeof newLogs, newLogs)
    return
  }

  const newLength = newLogs.length
  const newLogCount = newLength - lastProcessedLogCount
  
  if (import.meta.dev && newLogCount > 0) {
    console.log(`[XTerminal] Detected ${newLogCount} new log(s), writing instantly (total: ${newLength}, last processed: ${lastProcessedLogCount})`)
  }
  
  if (newLogCount > 0) {
    const logsToWrite = newLogs.slice(lastProcessedLogCount)
    logsToWrite.forEach((log) => {
      if (typeof log === 'string' && terminal) {
        terminal.write(log + '\r\n')
      }
    })
    lastProcessedLogCount = newLength
  } else if (newLogCount < 0 && newLength === 0) {
    console.log('[XTerminal] Logs array cleared to empty, clearing terminal')
    terminal?.clear()
    lastProcessedLogCount = 0
  } else if (newLogCount < 0 && newLength > 0) {
    if (import.meta.dev) {
      console.log(`[XTerminal] Logs decreased from ${lastProcessedLogCount} to ${newLength}, resetting counter`)
    }
    lastProcessedLogCount = newLength
  }
}, { immediate: true, flush: 'sync' })

defineExpose({
  search: (term: string) => searchAddon?.findNext(term),
  searchPrevious: (term: string) => searchAddon?.findPrevious(term),
  clear: () => {
    terminal?.clear()
    lastProcessedLogCount = 0
  },
  fit: () => fitAddon?.fit(),
  write: (text: string) => writeToTerminal(text),
  downloadLogs: () => {
    if (!terminal) return
    const lines: string[] = []
    for (let i = 0; i < terminal.buffer.active.length; i++) {
      const line = terminal.buffer.active.getLine(i)
      if (line) {
        lines.push(line.translateToString(false))
      }
    }
    const content = lines.join('\n')
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${t('server.console.downloadFilename')}-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  },
  scrollToBottom: () => {
    terminal?.scrollToBottom()
  },
})
</script>

<template>
  <div 
    ref="terminalRef" 
    class="h-full w-full cursor-text"
    @click="handleTerminalClick"
  />
</template>

<style scoped>

:deep(.xterm) {
  height: 100%;
  padding: 1rem;
}

:deep(.xterm-viewport) {
  overflow-y: auto;
}

:deep(.xterm-viewport::-webkit-scrollbar) {
  width: 8px;
}

:deep(.xterm-viewport::-webkit-scrollbar-track) {
  background: rgba(0, 0, 0, 0.2);
}

:deep(.xterm-viewport::-webkit-scrollbar-thumb) {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 4px;
}

:deep(.xterm-viewport::-webkit-scrollbar-thumb:hover) {
  background: rgba(255, 255, 255, 0.3);
}
</style>
