import type {
  DetachInputCapability,
  DetachInputRequest,
  DetachInputRole,
  DetachInputState,
  DetachInputUserPolicy,
} from '../types/detachInput';

const CAPABILITIES = new Set<DetachInputCapability>([
  'none',
  'optional',
  'required',
]);

const ROLES = new Set<DetachInputRole>(['search', 'filter', 'command']);

export function normalizeDetachInputCapability(
  value: unknown
): DetachInputCapability {
  return CAPABILITIES.has(value as DetachInputCapability)
    ? (value as DetachInputCapability)
    : 'optional';
}

export function normalizeDetachInputRequest(
  value: unknown
): DetachInputRequest {
  const source =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  return {
    requested: source.requested === true,
    value: typeof source.value === 'string' ? source.value : '',
    placeholder:
      typeof source.placeholder === 'string' ? source.placeholder : '',
    focus: source.focus === true,
    role: ROLES.has(source.role as DetachInputRole)
      ? (source.role as DetachInputRole)
      : 'search',
  };
}

export function resolveDetachInputState({
  capability,
  policy,
  request,
}: {
  capability: unknown;
  policy: DetachInputUserPolicy;
  request: unknown;
}): DetachInputState {
  const normalizedCapability = normalizeDetachInputCapability(capability);
  const normalizedRequest = normalizeDetachInputRequest(request);
  const visible =
    normalizedCapability === 'required' ||
    (normalizedCapability === 'optional' &&
      (normalizedRequest.requested || policy === 'always'));

  return {
    ...normalizedRequest,
    capability: normalizedCapability,
    policy,
    visible,
    focus: visible && normalizedRequest.focus,
  };
}
