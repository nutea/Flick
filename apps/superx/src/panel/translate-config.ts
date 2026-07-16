/** 超级面板翻译：与 feature 设置页、DB `flick-system-super-panel-preferences` 的 data 字段对齐 */

import { DEFAULT_TRANSLATE_SYSTEM_PROMPT as SYSTEM_DEFAULT } from '../../../feature/src/utils/superPanelTranslateBuiltinPrompt';

export type SuperPanelTranslateProvider = 'openai_chat';

/** 单条可保存的翻译接口配置（多配置列表中的一项） */
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

export interface SuperPanelTranslatePrefs {
  translateProvider?: SuperPanelTranslateProvider;
  llmBaseUrl?: string;
  llmApiKey?: string;
  llmModel?: string;
  llmSystemPrompt?: string;
  llmExtraHeaders?: string;
  anthropicApiVersion?: string;
  anthropicMaxTokens?: number;
}

type PlainObject = Record<string, unknown>;

export function defaultTranslatePrefs(): SuperPanelTranslatePrefs {
  return {
    translateProvider: 'openai_chat',
  };
}

export function isTranslateConfigured(p: SuperPanelTranslatePrefs | undefined | null): boolean {
  if (!p) return false;
  return !!(
    String(p.llmBaseUrl || '').trim() &&
    String(p.llmApiKey || '').trim() &&
    String(p.llmModel || '').trim()
  );
}

function coerceProvider(raw: unknown): SuperPanelTranslateProvider {
  if (raw === 'anthropic_messages' || raw === 'youdao_openapi') return 'openai_chat';
  return 'openai_chat';
}

function parseMaxTokens(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return Math.floor(raw);
  const n = parseInt(String(raw ?? '1024'), 10);
  return Number.isFinite(n) && n > 0 ? n : 1024;
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

export function profileToPrefs(p: TranslateProfile): SuperPanelTranslatePrefs {
  return {
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

function legacyFlatToPrefs(data: Record<string, unknown> | undefined | null): SuperPanelTranslatePrefs {
  if (!data) return {};
  return {
    translateProvider: coerceProvider(data.translateProvider),
    llmBaseUrl: data.llmBaseUrl != null ? String(data.llmBaseUrl) : undefined,
    llmApiKey: data.llmApiKey != null ? String(data.llmApiKey) : undefined,
    llmModel: data.llmModel != null ? String(data.llmModel) : undefined,
    llmSystemPrompt: data.llmSystemPrompt != null ? String(data.llmSystemPrompt) : undefined,
    llmExtraHeaders: data.llmExtraHeaders != null ? String(data.llmExtraHeaders) : undefined,
    anthropicApiVersion:
      data.anthropicApiVersion != null ? String(data.anthropicApiVersion) : undefined,
    anthropicMaxTokens:
      typeof data.anthropicMaxTokens === 'number' ? data.anthropicMaxTokens : undefined,
  };
}

/** 从 preferences 文档 data 解析当前生效的翻译请求参数（多配置 / 旧版平铺） */
export function resolveTranslatePrefsFromPreferencesData(
  data: Record<string, unknown> | undefined | null
): SuperPanelTranslatePrefs {
  const rawList = data?.translateProfiles;
  if (Array.isArray(rawList) && rawList.length) {
    const profiles = rawList
      .map((x) => normalizeTranslateProfile(x))
      .filter((x): x is TranslateProfile => x != null);
    if (!profiles.length) return {};
    const wantId = String(data?.activeTranslateProfileId || '').trim();
    const picked = wantId ? profiles.find((p) => p.id === wantId) : undefined;
    const p = picked || profiles[0];
    return profileToPrefs(p);
  }
  return legacyFlatToPrefs(data ?? undefined);
}

function parseExtraHeaders(raw: string | undefined): Record<string, string> {
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return Object.fromEntries(
        Object.entries(parsed as Record<string, unknown>).map(([k, v]) => [k, String(v)])
      );
    }
  } catch {
    /* ignore */
  }
  return {};
}

function extractTextContent(content: unknown): string {
  if (typeof content === 'string') return content.trim();
  if (content && typeof content === 'object' && !Array.isArray(content)) {
    return extractTextFromObject(content as PlainObject);
  }
  if (!Array.isArray(content)) return '';

  const parts = content.flatMap((item) => {
    if (typeof item === 'string') return [item];
    if (!item || typeof item !== 'object') return [];

    const block = item as {
      type?: string;
      text?: unknown;
      content?: unknown;
    };

    if (typeof block.text === 'string') return [block.text];
    if (typeof block.content === 'string') return [block.content];
    return [];
  });

  return parts.join('\n').trim();
}

function extractTextFromObject(obj: PlainObject): string {
  const directKeys = ['content', 'text', 'output_text', 'answer', 'response', 'completion'];
  for (const key of directKeys) {
    const value = obj[key];
    const text = extractTextContent(value);
    if (text) return text;
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  for (const value of Object.values(obj)) {
    const text = extractTextContent(value);
    if (text) return text;
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function extractOpenAiResponseText(json: unknown): string {
  const data = json as {
    choices?: Array<{
      message?: { content?: unknown; reasoning_content?: unknown };
      text?: unknown;
      delta?: { content?: unknown };
      content?: unknown;
    }>;
    output_text?: unknown;
    data?: unknown;
    result?: unknown;
    response?: unknown;
  };

  if (typeof data.output_text === 'string' && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const choice = data.choices?.[0];
  const choiceText =
    (choice &&
      (extractTextContent(choice.message?.content) ||
        extractTextContent(choice.message?.reasoning_content) ||
        extractTextContent(choice.delta?.content) ||
        extractTextContent(choice.content) ||
        (typeof choice.text === 'string' ? choice.text.trim() : ''))) ||
    '';
  if (choiceText) return choiceText;

  const containers = [data.data, data.result, data.response];
  for (const container of containers) {
    if (!container || typeof container !== 'object') continue;
    const text = extractTextFromObject(container as PlainObject);
    if (text) return text;
  }

  return '';
}

function stripFences(s: string): string {
  return s
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function llmTextToPanelJsonString(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) return JSON.stringify({ translation: [] });
  const stripped = stripFences(trimmed);
  try {
    const parsed = JSON.parse(stripped) as {
      basic?: { explains?: string[]; phonetic?: string };
      translation?: string[];
    };
    if (parsed && (parsed.translation?.length || parsed.basic?.explains?.length)) {
      return JSON.stringify(parsed);
    }
  } catch {
    /* fall through */
  }
  return JSON.stringify({ translation: [stripped] });
}

function shouldTranslateToEnglish(word: string): boolean {
  return /[\u3400-\u9FFF\uF900-\uFAFF]/.test(word);
}

function buildTranslateUserPrompt(word: string): string {
  const targetLanguage = shouldTranslateToEnglish(word) ? 'English' : 'Simplified Chinese';
  return [
    `Translate the following text into ${targetLanguage}.`,
    'Return ONLY valid JSON with the shape {"translation":["main translation text"]}.',
    'Do not use markdown fences.',
    'Return exactly one clean translation in translation.',
    'Do not include explanations, notes, alternatives, transliteration, glosses, labels, or commentary.',
    'Text:',
    '',
    word,
  ].join('\n');
}

async function fetchOpenAiCompatible(word: string, prefs: SuperPanelTranslatePrefs): Promise<string> {
  const baseUrl = String(prefs.llmBaseUrl || '').trim();
  const apiKey = String(prefs.llmApiKey || '').trim();
  const model = String(prefs.llmModel || '').trim();
  const extra = parseExtraHeaders(prefs.llmExtraHeaders);
  const system = String(prefs.llmSystemPrompt || '').trim() || SYSTEM_DEFAULT;
  const userMsg = buildTranslateUserPrompt(word);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
    ...extra,
  };

  const body = {
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: userMsg },
    ],
    temperature: 0.2,
    max_tokens: 1024,
    max_completion_tokens: 1024,
  };

  const res = await fetch(baseUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    return JSON.stringify({ translation: [`Error: HTTP ${res.status}: ${text.slice(0, 400)}`] });
  }
  let content = '';
  try {
    const json = JSON.parse(text) as {
      error?: { message?: string };
    };
    if (json.error?.message) {
      return JSON.stringify({
        translation: [`Error: ${json.error.message}`],
      });
    }
    content = extractOpenAiResponseText(json);
  } catch {
    content = text.trim();
  }
  if (!content) {
    return JSON.stringify({ translation: ['Error: Empty response from model.'] });
  }
  return llmTextToPanelJsonString(content);
}

/** 返回与面板解析一致的 JSON 字符串 */
export async function fetchTranslationRaw(
  word: string,
  prefs: SuperPanelTranslatePrefs
): Promise<string> {
  return fetchOpenAiCompatible(word, prefs);
}
