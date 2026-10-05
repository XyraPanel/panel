import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

function isPrivateOrReservedIpv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) {
    return true;
  }
  const [a = 0, b = 0] = parts;

  if (a === 127) return true; // loopback
  if (a === 10) return true; // private
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 169 && b === 254) return true; // link-local + cloud metadata
  if (a === 0) return true; // "this network"
  if (a >= 224) return true; // multicast/reserved

  return false;
}

function isPrivateOrReservedIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === '::1') return true; // loopback
  if (normalized.startsWith('fe80:')) return true; // link-local
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true; // unique local
  if (normalized.startsWith('::ffff:')) {
    // IPv4-mapped IPv6 address — check the embedded IPv4.
    const embedded = normalized.split(':').pop() ?? '';
    if (isIP(embedded) === 4) {
      return isPrivateOrReservedIpv4(embedded);
    }
  }
  return false;
}

/**
 * Blocks a remote-fetch URL from targeting loopback/private/link-local addresses
 * (including the 169.254.169.254 cloud metadata endpoint), so a user can't turn a
 * "pull a file from this URL" feature into an SSRF pivot against the Wings host's
 * internal network. Only controls the host — path/query are the caller's business.
 */
export async function assertSafeRemoteUrl(rawUrl: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw createError({ status: 400, message: 'Invalid URL' });
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw createError({ status: 400, message: 'URL must use http or https' });
  }

  const hostname = url.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw createError({ status: 400, message: 'URL host is not allowed' });
  }

  const ipVersion = isIP(hostname);
  if (ipVersion === 4 && isPrivateOrReservedIpv4(hostname)) {
    throw createError({ status: 400, message: 'URL host is not allowed' });
  }
  if (ipVersion === 6 && isPrivateOrReservedIpv6(hostname)) {
    throw createError({ status: 400, message: 'URL host is not allowed' });
  }

  if (!ipVersion) {
    let resolved: Array<{ address: string; family: number }>;
    try {
      resolved = await lookup(hostname, { all: true });
    } catch {
      throw createError({ status: 400, message: 'Could not resolve URL host' });
    }

    for (const { address, family } of resolved) {
      if (family === 4 && isPrivateOrReservedIpv4(address)) {
        throw createError({ status: 400, message: 'URL host is not allowed' });
      }
      if (family === 6 && isPrivateOrReservedIpv6(address)) {
        throw createError({ status: 400, message: 'URL host is not allowed' });
      }
    }
  }
}
