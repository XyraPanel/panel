<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import type { ServerTerminalProps } from '#shared/types/server-console'
import type { Terminal } from 'xterm'

const props = defineProps<ServerTerminalProps>()
const emit = defineEmits<{
  command: [command: string]
}>()

const terminalRef = ref<HTMLElement | null>(null)
let terminal: Terminal | null = null
let fitAddon: import('xterm-addon-fit').FitAddon | null = null
let searchAddon: import('xterm-addon-search').SearchAddon | null = null
let webLinksAddon: import('xterm-addon-web-links').WebLinksAddon | null = null
let commandBuffer = ''

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
    cursorBlink: false,
    cursorStyle: 'underline',
    allowTransparency: true,
    scrollback: 5000,
    disableStdin: false,
  })

  fitAddon = new FitAddon()
  searchAddon = new SearchAddon()
  webLinksAddon = new WebLinksAddon()

  terminal.loadAddon(fitAddon)
  terminal.loadAddon(searchAddon)
  terminal.loadAddon(webLinksAddon)

  terminal.open(terminalRef.value)
  fitAddon.fit()

  terminal.onData((data: string) => {
    if (!props.connected) return

    if (data === '\r') {

      if (commandBuffer.trim()) {
        emit('command', commandBuffer)
        commandBuffer = ''
      }
      terminal?.write('\r\n')
    } else if (data === '\u007F') {

      if (commandBuffer.length > 0) {
        commandBuffer = commandBuffer.slice(0, -1)
        terminal?.write('\b \b')
      }
    } else if (data === '\u0003') {

      commandBuffer = ''
      terminal?.write('^C\r\n')
    } else {

      commandBuffer += data
      terminal?.write(data)
    }
  })

  const resizeObserver = new ResizeObserver(() => {
    fitAddon?.fit()
  })
  resizeObserver.observe(terminalRef.value)

  if (props.logs.length > 0) {
    props.logs.forEach(log => {
      terminal?.writeln(log)
    })
  }

  onUnmounted(() => {
    resizeObserver.disconnect()
    terminal?.dispose()
  })
})

watch(() => props.logs, (newLogs, oldLogs) => {
  if (!terminal) return

  const newLogCount = newLogs.length - (oldLogs?.length || 0)
  if (newLogCount > 0) {
    const logsToWrite = newLogs.slice(-newLogCount)
    logsToWrite.forEach(log => {
      terminal?.writeln(log)
    })
  }
}, { deep: false })

watch(() => props.connected, (isConnected) => {
  if (!terminal) return

  if (isConnected) {
    terminal.writeln('\x1b[32m[Connected to server console]\x1b[0m')
  } else {
    terminal.writeln('\x1b[31m[Disconnected from server console]\x1b[0m')
  }
})

defineExpose({
  search: (term: string) => searchAddon?.findNext(term),
  searchPrevious: (term: string) => searchAddon?.findPrevious(term),
  clear: () => terminal?.clear(),
  fit: () => fitAddon?.fit(),
})
</script>

<template>
  <div ref="terminalRef" class="h-full w-full" />
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
