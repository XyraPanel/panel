import redisDriver from 'unstorage/drivers/redis';

export default defineNitroPlugin(() => {
  const config = useRuntimeConfig().redis;

  if (!config?.host) return;

  useStorage().mount(
    'redis',
    redisDriver({
      base: 'redis',
      host: config.host,
      port: config.port,
      username: config.username,
      password: config.password,
      tls: config.tls ? {} : undefined,
    }),
  );
});
