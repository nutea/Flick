import type { SuperPanelTranslateProvider } from './superPanelTranslatePrefs';
import { isTranslateConfigured } from './superPanelTranslatePrefs';

export interface TranslateTestPrefs {
  translateProvider: SuperPanelTranslateProvider;
  llmBaseUrl: string;
  llmApiKey: string;
  llmModel: string;
  llmSystemPrompt: string;
  llmExtraHeaders: string;
  anthropicApiVersion: string;
  anthropicMaxTokens: number;
}

const TEST_SYSTEM = 'You are a connectivity check. Reply with exactly OK and nothing else.';
const TEST_USER = 'ping';

type PlainObject = Record<string, unknown>;

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

function looksLikeSuccessfulResponse(json: unknown): boolean {
  if (!json || typeof json !== 'object') return false;
  const data = json as {
    id?: unknown;
    model?: unknown;
    object?: unknown;
    choices?: unknown;
    content?: unknown;
    base_resp?: { status_code?: unknown };
  };

  const baseStatus = data.base_resp?.status_code;
  if (typeof baseStatus === 'number') return baseStatus === 0;

  return !!(
    data.id ||
    data.object ||
    (Array.isArray(data.choices) && data.choices.length > 0) ||
    data.content
  );
}

async function testOpenAi(prefs: TranslateTestPrefs): Promise<{ ok: boolean; message: string }> {
  const baseUrl = prefs.llmBaseUrl.trim();
  const apiKey = prefs.llmApiKey.trim();
  const model = prefs.llmModel.trim();
  const extra = parseExtraHeaders(prefs.llmExtraHeaders);

  const res = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      ...extra,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: TEST_SYSTEM },
        { role: 'user', content: TEST_USER },
      ],
      temperature: 0,
      max_tokens: 8,
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    return { ok: false, message: `HTTP ${res.status}: ${text.slice(0, 400)}` };
  }
  try {
    const json = JSON.parse(text) as {
      error?: { message?: string };
    };
    if (json.error?.message) {
      return { ok: false, message: json.error.message };
    }
    const content = extractOpenAiResponseText(json);
    if (content) {
      return { ok: true, message: content.slice(0, 200) };
    }
    if (looksLikeSuccessfulResponse(json) || typeof json === 'object') {
      const modelName =
        typeof (json as { model?: unknown }).model === 'string'
          ? String((json as { model?: unknown }).model)
          : model;
      return { ok: true, message: `Connected${modelName ? ` (${modelName})` : ''}` };
    }
    return { ok: false, message: 'Empty response from model.' };
  } catch {
    const plain = text.trim();
    if (plain) {
      return { ok: true, message: plain.slice(0, 200) };
    }
    return { ok: false, message: text.slice(0, 400) };
  }
}

export async function testTranslateConnection(
  prefs: TranslateTestPrefs
): Promise<{ ok: boolean; message: string }> {
  if (!isTranslateConfigured(prefs)) {
    return { ok: false, message: 'missing_fields' };
  }
  try {
    return await testOpenAi(prefs);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: msg };
  }
}
