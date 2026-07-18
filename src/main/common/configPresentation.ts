import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  imageProtocolSource,
  toImageProtocolUrl,
} from '@/common/utils/imageProtocol';

export const DEFAULT_APP_LOGO = 'flick-asset:app-logo';

function decodeLocalLogo(raw: string): string | null {
  let value = raw.trim();
  if (/^image:/i.test(value)) value = imageProtocolSource(value) || '';
  if (/^file:/i.test(value)) {
    try {
      value = fileURLToPath(value);
    } catch {
      return null;
    }
  }
  return path.isAbsolute(value) ? value : null;
}

function defaultLogoPath(): string {
  return path.join(__static, 'logo.png');
}

let defaultLogoDataUrl: string | null = null;

function defaultLogoUrl(): string {
  if (defaultLogoDataUrl) return defaultLogoDataUrl;
  try {
    defaultLogoDataUrl = `data:image/png;base64,${fs
      .readFileSync(defaultLogoPath())
      .toString('base64')}`;
    return defaultLogoDataUrl;
  } catch {
    // Keep the protocol URL as a development fallback if the bundled asset is absent.
    return toImageProtocolUrl(defaultLogoPath());
  }
}

export function resolveConfiguredLogo(raw: unknown): string {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value || value === DEFAULT_APP_LOGO) {
    return defaultLogoUrl();
  }
  if (/^(?:data|blob|https?):/i.test(value)) return value;
  const local = decodeLocalLogo(value);
  if (local) {
    try {
      if (fs.statSync(local).isFile()) return toImageProtocolUrl(local);
    } catch {
      // Missing legacy paths fall back to the current application asset.
    }
  }
  return defaultLogoUrl();
}

export function migrateConfiguredLogo(raw: unknown): string {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value || value === DEFAULT_APP_LOGO) return DEFAULT_APP_LOGO;
  const local = decodeLocalLogo(value);
  if (!local) return value;

  const relative = path.relative(path.resolve(__static), path.resolve(local));
  const bundled =
    relative === 'logo.png' ||
    (!relative.startsWith('..') && !path.isAbsolute(relative));
  if (bundled) return DEFAULT_APP_LOGO;
  try {
    if (!fs.statSync(local).isFile()) return DEFAULT_APP_LOGO;
  } catch {
    return DEFAULT_APP_LOGO;
  }
  return value;
}
