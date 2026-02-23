export const CIDR_MAX_BITS = 25;
export const CIDR_MIN_BITS = 32;
export const PORT_FLOOR = 1024;
export const PORT_CEIL = 65535;
export const PORT_RANGE_LIMIT = 1000;

export class CidrOutOfRangeError extends Error {
  constructor() {
    super(`CIDR notation must be between /${CIDR_MAX_BITS} and /${CIDR_MIN_BITS}`);
    this.name = 'CidrOutOfRangeError';
  }
}

export class InvalidIpAddressError extends Error {
  constructor(ip: string) {
    super(`Invalid IP address format: ${ip}`);
    this.name = 'InvalidIpAddressError';
  }
}

function ipToNumber(ip: string): number {
  const parts = ip.split('.');
  if (parts.length !== 4) {
    throw new InvalidIpAddressError(ip);
  }

  let num = 0;
  for (let i = 0; i < 4; i++) {
    const part = Number.parseInt(parts[i]!, 10);
    if (!Number.isFinite(part) || part < 0 || part > 255) {
      throw new InvalidIpAddressError(ip);
    }
    num = (num << 8) + part;
  }

  return num >>> 0;
}

function numberToIp(num: number): string {
  return [(num >>> 24) & 0xff, (num >>> 16) & 0xff, (num >>> 8) & 0xff, num & 0xff].join('.');
}

export function parseCidr(cidr: string): string[] {
  const parts = cidr.split('/');

  if (parts.length === 1) {
    const ip = parts[0]!.trim();
    if (!isValidIp(ip)) {
      throw new InvalidIpAddressError(ip);
    }
    return [ip];
  }

  if (parts.length !== 2) {
    throw new InvalidIpAddressError(cidr);
  }

  const ip = parts[0]!.trim();
  const prefixLength = Number.parseInt(parts[1]!, 10);

  if (
    !Number.isFinite(prefixLength) ||
    prefixLength < CIDR_MAX_BITS ||
    prefixLength > CIDR_MIN_BITS
  ) {
    throw new CidrOutOfRangeError();
  }

  if (!isValidIp(ip)) {
    throw new InvalidIpAddressError(ip);
  }

  const ipNum = ipToNumber(ip);
  const mask = (0xffffffff << (32 - prefixLength)) >>> 0;
  const networkNum = (ipNum & mask) >>> 0;
  const hostCount = Math.pow(2, 32 - prefixLength);

  const ips: string[] = [];
  for (let i = 0; i < hostCount; i++) {
    const hostIp = (networkNum + i) >>> 0;
    ips.push(numberToIp(hostIp));
  }

  return ips;
}

export function isValidIp(ip: string): boolean {
  const ipv4Regex =
    /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  return ipv4Regex.test(ip);
}

export function parsePorts(input: string | number[]): number[] {
  if (Array.isArray(input)) {
    return input.filter((p) => Number.isFinite(p) && p >= PORT_FLOOR && p <= PORT_CEIL);
  }

  const normalized = String(input).replace(/\s+/g, '');

  if (normalized.includes('-')) {
    const [startRaw, endRaw] = normalized.split('-', 2);
    const start = Number.parseInt(startRaw!, 10);
    const end = Number.parseInt(endRaw!, 10);

    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start < PORT_FLOOR ||
      end > PORT_CEIL ||
      start > end
    ) {
      throw new Error(
        `Port range must be between ${PORT_FLOOR} and ${PORT_CEIL}, and start must be less than or equal to end`,
      );
    }

    const range = end - start + 1;
    if (range > PORT_RANGE_LIMIT) {
      throw new Error(`Port range cannot exceed ${PORT_RANGE_LIMIT} ports`);
    }

    const ports: number[] = [];
    for (let port = start; port <= end; port++) {
      ports.push(port);
    }
    return ports;
  }

  const segments = normalized.split(',');
  const ports = segments.map((segment) => {
    const port = Number.parseInt(segment, 10);
    if (!Number.isFinite(port) || port < PORT_FLOOR || port > PORT_CEIL) {
      throw new Error(`Ports must be between ${PORT_FLOOR} and ${PORT_CEIL}`);
    }
    return port;
  });

  return ports;
}
