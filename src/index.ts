import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';

export type AccountConfig = {
  alias: string;
  accountId: string;
  name?: string;
  environment?: string;
  apiKeyEnv?: string;
};

export type ProductConfig = {
  name: string;
  lookupKey?: string;
  currency: string;
  monthlyPrice?: number;
  yearlyPrice?: number;
  oneTimePrice?: number;
  usagePrice?: number;
};

export type WebhookConfig = {
  url: string;
  events: string[];
};

export type AppConfig = {
  name: string;
  stripeAccount: string;
  supportEmail?: string;
  privacyUrl?: string;
  termsUrl?: string;
  currency: string;
  products: ProductConfig[];
  webhooks: WebhookConfig[];
};

export type BillplyConfig = {
  accounts: Record<string, AccountConfig>;
  apps: AppConfig[];
};

export type PlanAction = {
  marker: '+' | '=' | '!';
  message: string;
  destructive: boolean;
};

export type PlanResult = {
  actions: PlanAction[];
  destructiveChanges: PlanAction[];
};

type UnknownRecord = Record<string, unknown>;

const ROOT_KEYS = new Set(['accounts', 'apps']);
const ACCOUNT_KEYS = new Set(['account_id', 'name', 'environment', 'api_key_env']);
const APP_KEYS = new Set([
  'name', 'stripe_account', 'support_email', 'privacy_url', 'terms_url',
  'currency', 'products', 'webhooks'
]);
const PRODUCT_KEYS = new Set([
  'name', 'lookup_key', 'currency', 'monthly_price', 'yearly_price',
  'one_time_price', 'usage_price'
]);
const WEBHOOK_KEYS = new Set(['url', 'events']);

const ZERO_DECIMAL_CURRENCIES = new Set([
  'bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga', 'pyg', 'rwf',
  'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf'
]);

const THREE_DECIMAL_CURRENCIES = new Set([
  'bhd', 'jod', 'kwd', 'omr', 'tnd'
]);

export function currencyMinorUnitExponent(currency: string): number {
  const normalizedCurrency = currency.toLowerCase();

  if (ZERO_DECIMAL_CURRENCIES.has(normalizedCurrency)) {
    return 0;
  }

  return THREE_DECIMAL_CURRENCIES.has(normalizedCurrency) ? 3 : 2;
}

export class ConfigError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Invalid billply config:\n${issues.map((issue) => `- ${issue}`).join('\n')}`);
    this.name = 'ConfigError';
    this.issues = issues;
  }
}

export async function loadConfig(configPath = 'billply.yaml'): Promise<BillplyConfig> {
  const resolvedPath = path.resolve(configPath);
  let source: string;

  try {
    source = await readFile(resolvedPath, 'utf8');
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown read error';
    throw new ConfigError([`Unable to read config at ${resolvedPath}: ${detail}`]);
  }

  return parseConfig(source);
}

export function parseConfig(source: string): BillplyConfig {
  let parsed: unknown;
  try {
    parsed = parseYaml(source);
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown YAML parse error';
    throw new ConfigError([`Unable to parse YAML: ${detail}`]);
  }
  const issues: string[] = [];

  if (!isRecord(parsed)) {
    throw new ConfigError(['Config must be a YAML object with accounts and apps.']);
  }

  rejectUnknownKeys(parsed, ROOT_KEYS, '', issues);
  const accounts = parseAccounts(parsed.accounts, issues);
  const apps = parseApps(parsed.apps, accounts, issues);
  validateDerivedKeys(accounts, apps, issues);

  if (issues.length > 0) {
    throw new ConfigError(issues);
  }

  return { accounts, apps };
}

export function buildPlan(config: BillplyConfig): PlanResult {
  const actions: PlanAction[] = [];

  for (const account of Object.values(config.accounts)) {
    actions.push(action('=', `Use Stripe account ${account.alias} (${account.accountId})`));
  }

  for (const app of config.apps) {
    actions.push(action('+', `Configure customer portal for ${app.name}`));
    actions.push(action('+', `Generate checkout defaults for ${app.name}`));

    for (const product of app.products) {
      actions.push(action('+', `Create product ${app.name} / ${product.name}`));

      for (const price of productPrices(product)) {
        actions.push(action('+', `Create ${price.label} price ${formatMoney(price.amount, product.currency)} for ${product.name}`));
      }
    }

    for (const webhook of app.webhooks) {
      actions.push(action('+', `Configure webhook ${webhook.url} with ${webhook.events.length} event(s)`));
    }
  }

  return {
    actions,
    destructiveChanges: actions.filter((item) => item.destructive)
  };
}

export function renderPlan(plan: PlanResult): string {
  const lines = plan.actions.map((item) => `${item.marker} ${item.message}`);

  if (plan.destructiveChanges.length === 0) {
    lines.push('', 'No destructive changes');
  }

  return lines.join('\n');
}

export function exportRuntimeEnv(config: BillplyConfig): string {
  const lines: string[] = [];

  for (const account of Object.values(config.accounts)) {
    lines.push(`${envKey('STRIPE', account.alias, 'ACCOUNT_ID')}=${account.accountId}`);

    if (account.apiKeyEnv) {
      lines.push(`${envKey('STRIPE', account.alias, 'API_KEY_ENV')}=${account.apiKeyEnv}`);
    }
  }

  for (const app of config.apps) {
    for (const product of app.products) {
      for (const price of productPrices(product)) {
        lines.push(`${envKey('STRIPE', app.name, product.name, price.kind, 'LOOKUP_KEY')}=${lookupKey(app, product, price.kind)}`);
      }
    }
  }

  return `${lines.join('\n')}\n`;
}

export function verifyConfig(config: BillplyConfig): string[] {
  const warnings: string[] = [];

  for (const app of config.apps) {
    if (app.webhooks.length === 0) {
      warnings.push(`${app.name} has no webhooks configured.`);
    }
  }

  return warnings;
}

function parseAccounts(value: unknown, issues: string[]): Record<string, AccountConfig> {
  if (!isRecord(value)) {
    issues.push('accounts must be an object keyed by account alias.');
    return {};
  }

  const accounts: Record<string, AccountConfig> = {};

  for (const [alias, rawAccount] of Object.entries(value)) {
    if (!isRecord(rawAccount)) {
      issues.push(`accounts.${alias} must be an object.`);
      continue;
    }

    rejectUnknownKeys(rawAccount, ACCOUNT_KEYS, `accounts.${alias}`, issues);
    const accountId = readRequiredString(rawAccount, 'account_id', `accounts.${alias}`, issues);
    const name = readOptionalString(rawAccount, 'name', `accounts.${alias}`, issues);
    const environment = readOptionalString(rawAccount, 'environment', `accounts.${alias}`, issues);
    const apiKeyEnv = readOptionalString(rawAccount, 'api_key_env', `accounts.${alias}`, issues);

    if (accountId) {
      accounts[alias] = { alias, accountId, name, environment, apiKeyEnv };
    }
  }

  return accounts;
}

function parseApps(value: unknown, accounts: Record<string, AccountConfig>, issues: string[]): AppConfig[] {
  if (!Array.isArray(value)) {
    issues.push('apps must be a list.');
    return [];
  }

  return value.flatMap((rawApp, index) => {
    const location = `apps[${index}]`;

    if (!isRecord(rawApp)) {
      issues.push(`${location} must be an object.`);
      return [];
    }

    rejectUnknownKeys(rawApp, APP_KEYS, location, issues);
    const name = readRequiredString(rawApp, 'name', location, issues);
    const stripeAccount = readRequiredString(rawApp, 'stripe_account', location, issues);
    const supportEmail = readOptionalString(rawApp, 'support_email', location, issues);
    const privacyUrl = readOptionalString(rawApp, 'privacy_url', location, issues);
    const termsUrl = readOptionalString(rawApp, 'terms_url', location, issues);
    const currency = readOptionalCurrency(rawApp, 'currency', location, issues) ?? 'usd';
    const products = parseProducts(rawApp.products, currency, `${location}.products`, issues);
    const webhooks = parseWebhooks(rawApp.webhooks, `${location}.webhooks`, issues);

    if (stripeAccount && !accounts[stripeAccount]) {
      issues.push(`${location}.stripe_account references unknown account "${stripeAccount}".`);
    }

    if (!name || !stripeAccount) {
      return [];
    }

    return [{
      name,
      stripeAccount,
      supportEmail,
      privacyUrl,
      termsUrl,
      currency,
      products,
      webhooks
    }];
  });
}

function parseProducts(value: unknown, defaultCurrency: string, location: string, issues: string[]): ProductConfig[] {
  if (!Array.isArray(value) || value.length === 0) {
    issues.push(`${location} must be a non-empty list.`);
    return [];
  }

  return value.flatMap((rawProduct, index) => {
    const productLocation = `${location}[${index}]`;

    if (!isRecord(rawProduct)) {
      issues.push(`${productLocation} must be an object.`);
      return [];
    }

    rejectUnknownKeys(rawProduct, PRODUCT_KEYS, productLocation, issues);
    const name = readRequiredString(rawProduct, 'name', productLocation, issues);
    const lookupKeyValue = readOptionalString(rawProduct, 'lookup_key', productLocation, issues);
    const currency = readOptionalCurrency(rawProduct, 'currency', productLocation, issues) ?? defaultCurrency;
    const monthlyPrice = readOptionalAmount(rawProduct, 'monthly_price', productLocation, issues);
    const yearlyPrice = readOptionalAmount(rawProduct, 'yearly_price', productLocation, issues);
    const oneTimePrice = readOptionalAmount(rawProduct, 'one_time_price', productLocation, issues);
    const usagePrice = readOptionalAmount(rawProduct, 'usage_price', productLocation, issues);

    validateAmountPrecision(monthlyPrice, 'monthly_price', currency, productLocation, issues);
    validateAmountPrecision(yearlyPrice, 'yearly_price', currency, productLocation, issues);
    validateAmountPrecision(oneTimePrice, 'one_time_price', currency, productLocation, issues);
    validateAmountPrecision(usagePrice, 'usage_price', currency, productLocation, issues);

    if (monthlyPrice === undefined && yearlyPrice === undefined && oneTimePrice === undefined && usagePrice === undefined) {
      issues.push(`${productLocation} must define at least one price.`);
    }

    if (!name) {
      return [];
    }

    return [{
      name,
      lookupKey: lookupKeyValue,
      currency,
      monthlyPrice,
      yearlyPrice,
      oneTimePrice,
      usagePrice
    }];
  });
}

function parseWebhooks(value: unknown, location: string, issues: string[]): WebhookConfig[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    issues.push(`${location} must be a list when provided.`);
    return [];
  }

  return value.flatMap((rawWebhook, index) => {
    const webhookLocation = `${location}[${index}]`;

    if (!isRecord(rawWebhook)) {
      issues.push(`${webhookLocation} must be an object.`);
      return [];
    }

    rejectUnknownKeys(rawWebhook, WEBHOOK_KEYS, webhookLocation, issues);
    const url = readRequiredString(rawWebhook, 'url', webhookLocation, issues);
    const rawEvents = rawWebhook.events;

    if (url && !isHttpUrl(url)) {
      issues.push(`${webhookLocation}.url must be a valid HTTP or HTTPS URL.`);
    }

    if (!Array.isArray(rawEvents) || rawEvents.length === 0) {
      issues.push(`${webhookLocation}.events must be a non-empty list of Stripe event identifiers.`);
    } else {
      rawEvents.forEach((event, eventIndex) => {
        if (typeof event !== 'string' || !isStripeEventIdentifier(event)) {
          issues.push(`${webhookLocation}.events[${eventIndex}] must be a valid Stripe event identifier.`);
        }
      });
    }

    if (!url || !Array.isArray(rawEvents)) {
      return [];
    }

    return [{ url, events: rawEvents as string[] }];
  });
}

function rejectUnknownKeys(
  value: UnknownRecord,
  allowedKeys: ReadonlySet<string>,
  location: string,
  issues: string[]
): void {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      const keyLocation = location ? `${location}.${key}` : key;
      issues.push(`${keyLocation} is not a supported configuration key.`);
    }
  }
}

function validateDerivedKeys(
  accounts: Record<string, AccountConfig>,
  apps: AppConfig[],
  issues: string[]
): void {
  const runtimeKeys = new Map<string, string>();
  const lookupKeys = new Map<string, string>();

  for (const account of Object.values(accounts)) {
    registerUniqueKey(runtimeKeys, envKey('STRIPE', account.alias, 'ACCOUNT_ID'), `accounts.${account.alias}.account_id`, 'runtime environment variable', issues);
    if (account.apiKeyEnv) {
      registerUniqueKey(runtimeKeys, envKey('STRIPE', account.alias, 'API_KEY_ENV'), `accounts.${account.alias}.api_key_env`, 'runtime environment variable', issues);
    }
  }

  apps.forEach((app, appIndex) => {
    app.products.forEach((product, productIndex) => {
      productPrices(product).forEach((price) => {
        const location = `apps[${appIndex}].products[${productIndex}].${price.kind}_price`;
        registerUniqueKey(lookupKeys, lookupKey(app, product, price.kind), location, 'Stripe lookup key', issues);
        registerUniqueKey(runtimeKeys, envKey('STRIPE', app.name, product.name, price.kind, 'LOOKUP_KEY'), location, 'runtime environment variable', issues);
      });
    });
  });
}

function registerUniqueKey(
  keys: Map<string, string>,
  key: string,
  location: string,
  label: string,
  issues: string[]
): void {
  const previousLocation = keys.get(key);
  if (previousLocation) {
    issues.push(`${location} derives duplicate ${label} "${key}" already derived by ${previousLocation}.`);
    return;
  }

  keys.set(key, location);
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.length > 0;
  } catch {
    return false;
  }
}

function isStripeEventIdentifier(value: string): boolean {
  return value === '*' || /^[a-z0-9_]+(?:\.[a-z0-9_]+)+$/.test(value);
}

function productPrices(product: ProductConfig): Array<{ kind: string; label: string; amount: number }> {
  return [
    product.monthlyPrice === undefined ? undefined : { kind: 'monthly', label: 'monthly recurring', amount: product.monthlyPrice },
    product.yearlyPrice === undefined ? undefined : { kind: 'yearly', label: 'yearly recurring', amount: product.yearlyPrice },
    product.oneTimePrice === undefined ? undefined : { kind: 'one_time', label: 'one-time', amount: product.oneTimePrice },
    product.usagePrice === undefined ? undefined : { kind: 'usage', label: 'usage-based', amount: product.usagePrice }
  ].filter((price): price is { kind: string; label: string; amount: number } => price !== undefined);
}

function action(marker: PlanAction['marker'], message: string): PlanAction {
  return { marker, message, destructive: false };
}

function readRequiredString(record: UnknownRecord, key: string, location: string, issues: string[]): string | undefined {
  const value = record[key];

  if (typeof value !== 'string' || value.trim() === '') {
    issues.push(`${location}.${key} must be a non-empty string.`);
    return undefined;
  }

  return value;
}

function readOptionalString(record: UnknownRecord, key: string, location: string, issues: string[]): string | undefined {
  const value = record[key];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string' || value.trim() === '') {
    issues.push(`${location}.${key} must be a non-empty string when provided.`);
    return undefined;
  }

  return value;
}

function readOptionalCurrency(record: UnknownRecord, key: string, location: string, issues: string[]): string | undefined {
  const value = record[key];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string' || !/^[a-zA-Z]{3}$/.test(value)) {
    issues.push(`${location}.${key} must be a three-letter ISO currency code when provided.`);
    return undefined;
  }

  return value.toLowerCase();
}

function readOptionalAmount(record: UnknownRecord, key: string, location: string, issues: string[]): number | undefined {
  const value = record[key];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    issues.push(`${location}.${key} must be a non-negative number when provided.`);
    return undefined;
  }

  return value;
}

function validateAmountPrecision(
  amount: number | undefined,
  key: string,
  currency: string,
  location: string,
  issues: string[]
): void {
  if (amount === undefined) {
    return;
  }

  const exponent = currencyMinorUnitExponent(currency);
  const factor = 10 ** exponent;
  const scaled = amount * factor;
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(scaled)) * 4;
  if (Math.abs(scaled - Math.round(scaled)) > tolerance) {
    issues.push(`${location}.${key} cannot have more than ${exponent} decimal places for ${currency.toUpperCase()}.`);
  }
}

function lookupKey(app: AppConfig, product: ProductConfig, kind: string): string {
  return slugify([app.name, product.lookupKey ?? product.name, kind].join('-'));
}

function envKey(...parts: string[]): string {
  return parts
    .join('_')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase()
    }).format(amount);
  } catch {
    return `${amount} ${currency.toUpperCase()}`;
  }
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
