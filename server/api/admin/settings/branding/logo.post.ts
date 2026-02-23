import { promises as fs, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join, extname } from 'pathe';
import { requireAdmin } from '#server/utils/security';
import { SETTINGS_KEYS, getSetting, setSetting } from '#server/utils/settings';
import { getUploadsPath } from '#server/utils/storage';
import { recordAuditEventFromRequest } from '#server/utils/audit';

const MAX_FILE_SIZE = 2 * 1024 * 1024;
const ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
};

function resolveExtension(filename: string | undefined, mimeType: string | undefined): string {
  if (mimeType && ALLOWED_MIME_TYPES[mimeType]) {
    return ALLOWED_MIME_TYPES[mimeType];
  }
  const ext = filename ? extname(filename).toLowerCase() : '';
  if (ext && Object.values(ALLOWED_MIME_TYPES).includes(ext)) {
    return ext;
  }
  return '.png';
}

function toPublicPath(filepath: string) {
  const relative = filepath.replace(/^[/]+/, '');
  return `/${relative}`;
}

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);

  const formData = await readMultipartFormData(event);
  if (!formData) {
    throw createError({ status: 400, statusText: 'Bad Request', message: 'No form data received' });
  }

  const file = formData.find((field) => field.name === 'logo' && field.data);

  if (!file) {
    throw createError({
      status: 422,
      statusText: 'Unprocessable Entity',
      message: 'Logo file is required',
    });
  }

  if (file.data.length > MAX_FILE_SIZE) {
    throw createError({
      status: 413,
      statusText: 'Payload Too Large',
      message: 'Logo must be less than 2MB',
    });
  }

  if (file.type && !ALLOWED_MIME_TYPES[file.type]) {
    throw createError({
      status: 415,
      statusText: 'Unsupported Media Type',
      message: 'Unsupported image format',
    });
  }

  const extension = resolveExtension(file.filename, file.type);
  const uploadDir = getUploadsPath('branding');
  const filename = `logo-${Date.now()}-${randomUUID().slice(0, 8)}${extension}`;
  const absolutePath = join(uploadDir, filename);
  const publicPath = toPublicPath(join('uploads', 'branding', filename));

  const existingLogo = await getSetting(SETTINGS_KEYS.BRAND_LOGO_PATH);
  if (existingLogo) {
    const existingPath = join(process.cwd(), 'public', existingLogo.replace(/^\//, ''));
    if (existsSync(existingPath)) {
      try {
        await fs.unlink(existingPath);
      } catch {
        // Swallow deletion errors but continue
      }
    }
  }

  await fs.writeFile(absolutePath, file.data);

  await setSetting(SETTINGS_KEYS.BRAND_LOGO_PATH, publicPath);
  await setSetting(SETTINGS_KEYS.BRAND_SHOW_LOGO, 'true');

  await recordAuditEventFromRequest(event, {
    actor: session.user.email || session.user.id,
    actorType: 'user',
    action: 'admin.branding.logo.uploaded',
    targetType: 'settings',
    metadata: {
      fileName: file.filename ?? undefined,
      mimeType: file.type ?? undefined,
      size: file.data.length,
    },
  });

  return {
    data: {
      url: publicPath,
    },
  };
});
