export interface CacheSetOptions {
  ttl?: number;
}

export interface CacheOptions extends CacheSetOptions {
  skipCache?: boolean;
}
