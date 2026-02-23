export default defineNitroPlugin(() => {
  if (process.env.NODE_ENV !== 'production') return;

  // Signals that the process is ready (enables wait_ready in ecosystem.config.cjs)
  const proc = process as typeof process & { send?: (msg: string) => void };
  if (typeof proc.send === 'function') {
    process.nextTick(() => proc.send?.('ready'));
  }
});
