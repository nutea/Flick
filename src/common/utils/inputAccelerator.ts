export interface AcceleratorInput {
  key: string;
  code?: string;
  control?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
}

const modifierAliases: Record<string, 'control' | 'shift' | 'alt' | 'meta'> = {
  ctrl: 'control',
  control: 'control',
  shift: 'shift',
  alt: 'alt',
  option: 'alt',
  cmd: 'meta',
  command: 'meta',
  meta: 'meta',
  super: 'meta',
};

function normalizedInputKey(input: AcceleratorInput): string {
  const code = String(input.code || '');
  if (/^Key[A-Z]$/i.test(code)) return code.slice(3).toLowerCase();
  if (/^Digit\d$/.test(code)) return code.slice(5);
  const key = String(input.key || '').toLowerCase();
  const aliases: Record<string, string> = {
    ' ': 'space',
    escape: 'esc',
    arrowup: 'up',
    arrowdown: 'down',
    arrowleft: 'left',
    arrowright: 'right',
  };
  return aliases[key] || key;
}

/** Match an Electron input event against a configured accelerator exactly. */
export function matchesInputAccelerator(
  input: AcceleratorInput,
  accelerator: unknown,
  platform: NodeJS.Platform = process.platform
): boolean {
  if (typeof accelerator !== 'string' || !accelerator.trim()) return false;
  const parts = accelerator
    .split('+')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  if (!parts.length) return false;

  const expected = {
    control: false,
    shift: false,
    alt: false,
    meta: false,
  };
  let expectedKey = '';
  for (const part of parts) {
    if (part === 'commandorcontrol' || part === 'cmdorctrl') {
      expected[platform === 'darwin' ? 'meta' : 'control'] = true;
      continue;
    }
    const modifier = modifierAliases[part];
    if (modifier) {
      expected[modifier] = true;
      continue;
    }
    if (expectedKey) return false;
    expectedKey = part === 'escape' ? 'esc' : part;
  }
  if (!expectedKey || normalizedInputKey(input) !== expectedKey) return false;
  return (
    Boolean(input.control) === expected.control &&
    Boolean(input.shift) === expected.shift &&
    Boolean(input.alt) === expected.alt &&
    Boolean(input.meta) === expected.meta
  );
}
