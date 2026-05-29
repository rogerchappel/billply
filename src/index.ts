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

  const accounts = parseAccounts(parsed.accounts, issues);
  const apps = parseApps(parsed.apps, accounts, issues);

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

    const name = readRequiredString(rawApp, 'name', location, issues);
    const stripeAccount = readRequiredString(rawApp, 'stripe_account', location, issues);
    const supportEmail = readOptionalString(rawApp, 'support_email', location, issues);
    const privacyUrl = readOptionalString(rawApp, 'privacy_url', location, issues);
    const termsUrl = readOptionalString(rawApp, 'terms_url', location, issues);
    const currency = readOptionalString(rawApp, 'currency', location, issues) ?? 'usd';
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

    const name = readRequiredString(rawProduct, 'name', productLocation, issues);
    const lookupKeyValue = readOptionalString(rawProduct, 'lookup_key', productLocation, issues);
    const currency = readOptionalString(rawProduct, 'currency', productLocation, issues) ?? defaultCurrency;
    const monthlyPrice = readOptionalAmount(rawProduct, 'monthly_price', productLocation, issues);
    const yearlyPrice = readOptionalAmount(rawProduct, 'yearly_price', productLocation, issues);
    const oneTimePrice = readOptionalAmount(rawProduct, 'one_time_price', productLocation, issues);
    const usagePrice = readOptionalAmount(rawProduct, 'usage_price', productLocation, issues);

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

    const url = readRequiredString(rawWebhook, 'url', webhookLocation, issues);
    const rawEvents = rawWebhook.events;

    if (!Array.isArray(rawEvents) || rawEvents.length === 0 || !rawEvents.every((event) => typeof event === 'string' && event.length > 0)) {
      issues.push(`${webhookLocation}.events must be a non-empty list of strings.`);
    }

    if (!url || !Array.isArray(rawEvents)) {
      return [];
    }

    return [{ url, events: rawEvents as string[] }];
  });
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
