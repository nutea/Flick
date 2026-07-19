export interface MarketSourceConfig {
  register: string;
  database: string;
  access_token: string;
}

export const DEFAULT_MARKET_SOURCE_CONFIG: Readonly<MarketSourceConfig> = {
  register: 'https://registry.npmmirror.com',
  database: 'https://gitee.com/monkeyWang/rubickdatabase/raw/master',
  access_token: '',
};

const configuredString = (value: unknown, fallback: string): string =>
  typeof value === 'string' && value.trim() ? value.trim() : fallback;

export const resolveMarketSourceConfig = (
  value: unknown
): MarketSourceConfig => {
  const configured =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};

  return {
    register: configuredString(
      configured.register,
      DEFAULT_MARKET_SOURCE_CONFIG.register
    ),
    database: configuredString(
      configured.database,
      DEFAULT_MARKET_SOURCE_CONFIG.database
    ),
    access_token:
      typeof configured.access_token === 'string'
        ? configured.access_token.trim()
        : DEFAULT_MARKET_SOURCE_CONFIG.access_token,
  };
};
