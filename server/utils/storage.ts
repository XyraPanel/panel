import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'pathe';

const uploadRoot = join(process.cwd(), 'public', 'uploads');

function ensureDir(path: string) {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

export function getUploadsPath(subdir = ''): string {
  ensureDir(uploadRoot);
  const target = join(uploadRoot, subdir);
  ensureDir(target);
  return target;
}
