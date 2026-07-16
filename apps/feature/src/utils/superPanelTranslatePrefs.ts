/** 与 apps/superx/src/panel/translate-config.ts 字段保持一致 */

import { nanoid } from 'nanoid';

export type SuperPanelTranslateProvider = 'openai_chat';

export interface TranslateProfile {
  id: string;
  name: string;
  translateProvider: SuperPanelTranslateProvider;
  llmBaseUrl: string;
  llmApiKey: string;
  llmModel: string;
  llmSystemPrompt: string;
  llmExtraHeaders: string;
  anthropicApiVersion: string;
  anthropicMaxTokens: number;
}

/** 保存到 DB 时需移除的旧版平铺字段 */
export const LEGACY_TRANSLATE_FLAT_KEYS = [
  'translateProvider',
  'llmBaseUrl',
  'llmApiKey',
  'llmModel',
  'llmSystemPrompt',
  'llmExtraHeaders',
  'anthropicApiVersion',
  'anthropicMaxTokens',
] as const;

function coerceProvider(raw: unknown): SuperPanelTranslateProvider {
  if (raw === 'anthropic_messages' || raw === 'youdao_openapi') return 'openai_chat';
  return 'openai_chat';
}

function parseMaxTokens(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return Math.floor(raw);
  const n = parseInt(String(raw ?? '1024'), 10);
  return Number.isFinite(n) && n > 0 ? n : 1024;
}

export function isTranslateConfigured(p: {
  llmBaseUrl?: string;
  llmApiKey?: string;
  llmModel?: string;
}): boolean {
  return !!(
    String(p.llmBaseUrl || '').trim() &&
    String(p.llmApiKey || '').trim() &&
    String(p.llmModel || '').trim()
  );
}

export function emptyProfile(id: string, name: string): TranslateProfile {
  return {
    id,
    name,
    translateProvider: 'openai_chat',
    llmBaseUrl: '',
    llmApiKey: '',
    llmModel: '',
    llmSystemPrompt: '',
    llmExtraHeaders: '',
    anthropicApiVersion: '2023-06-01',
    anthropicMaxTokens: 1024,
  };
}

export function normalizeTranslateProfile(raw: unknown): TranslateProfile | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = String(o.id || '').trim();
  if (!id) return null;
  return {
    id,
    name: String(o.name || '').trim() || '—',
    translateProvider: coerceProvider(o.translateProvider),
    llmBaseUrl: String(o.llmBaseUrl ?? ''),
    llmApiKey: String(o.llmApiKey ?? ''),
    llmModel: String(o.llmModel ?? ''),
    llmSystemPrompt: String(o.llmSystemPrompt ?? ''),
    llmExtraHeaders: String(o.llmExtraHeaders ?? ''),
    anthropicApiVersion: String(o.anthropicApiVersion ?? '2023-06-01').trim() || '2023-06-01',
    anthropicMaxTokens: parseMaxTokens(o.anthropicMaxTokens),
  };
}

function flatDataLooksConfigured(data: Record<string, unknown>): boolean {
  return isTranslateConfigured({
    llmBaseUrl: String(data.llmBaseUrl ?? ''),
    llmApiKey: String(data.llmApiKey ?? ''),
    llmModel: String(data.llmModel ?? ''),
  });
}

function profileFromFlatDoc(data: Record<string, unknown>): TranslateProfile {
  return {
    id: nanoid(),
    name: '默认配置',
    translateProvider: coerceProvider(data.translateProvider),
    llmBaseUrl: String(data.llmBaseUrl ?? ''),
    llmApiKey: String(data.llmApiKey ?? ''),
    llmModel: String(data.llmModel ?? ''),
    llmSystemPrompt: String(data.llmSystemPrompt ?? ''),
    llmExtraHeaders: String(data.llmExtraHeaders ?? ''),
    anthropicApiVersion: String(data.anthropicApiVersion ?? '2023-06-01').trim() || '2023-06-01',
    anthropicMaxTokens: parseMaxTokens(data.anthropicMaxTokens),
  };
}

export function loadProfilesFromDoc(data: Record<string, unknown> | undefined): {
  profiles: TranslateProfile[];
  activeProfileId: string | null;
} {
  if (!data) return { profiles: [], activeProfileId: null };

  const rawList = data.translateProfiles;
  if (Array.isArray(rawList) && rawList.length) {
    const profiles = rawList
      .map((x) => normalizeTranslateProfile(x))
      .filter((x): x is TranslateProfile => x != null);
    if (!profiles.length) return { profiles: [], activeProfileId: null };
    const want = String(data.activeTranslateProfileId || '').trim();
    const activeProfileId = want && profiles.some((p) => p.id === want) ? want : profiles[0].id;
    return { profiles, activeProfileId };
  }

  if (flatDataLooksConfigured(data)) {
    const p = profileFromFlatDoc(data);
    return { profiles: [p], activeProfileId: p.id };
  }

  return { profiles: [], activeProfileId: null };
}

export function profileToForm(p: TranslateProfile): Record<string, unknown> {
  return {
    profileId: p.id,
    profileName: p.name,
    translateProvider: p.translateProvider,
    llmBaseUrl: p.llmBaseUrl,
    llmApiKey: p.llmApiKey,
    llmModel: p.llmModel,
    llmSystemPrompt: p.llmSystemPrompt,
    llmExtraHeaders: p.llmExtraHeaders,
    anthropicApiVersion: p.anthropicApiVersion,
    anthropicMaxTokens: p.anthropicMaxTokens,
  };
}

export function formToProfile(form: {
  profileId: string;
  profileName: string;
  translateProvider: SuperPanelTranslateProvider;
  llmBaseUrl: string;
  llmApiKey: string;
  llmModel: string;
  llmSystemPrompt: string;
  llmExtraHeaders: string;
  anthropicApiVersion: string;
  anthropicMaxTokens: number;
}): TranslateProfile {
  return {
    id: form.profileId.trim() || nanoid(),
    name: form.profileName.trim() || '—',
    translateProvider: form.translateProvider,
    llmBaseUrl: form.llmBaseUrl,
    llmApiKey: form.llmApiKey,
    llmModel: form.llmModel,
    llmSystemPrompt: form.llmSystemPrompt,
    llmExtraHeaders: form.llmExtraHeaders,
    anthropicApiVersion: form.anthropicApiVersion.trim() || '2023-06-01',
    anthropicMaxTokens: form.anthropicMaxTokens,
  };
}
