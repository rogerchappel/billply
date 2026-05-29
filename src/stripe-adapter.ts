import {
  ConfigError,
  type AccountConfig,
  type AppConfig,
  type BillplyConfig,
  type ProductConfig,
  type WebhookConfig
} from './index.js';

export type StripeBillingClientFactory = (account: AccountConfig, apiKey: string) => StripeBillingClient;

export type StripeBillingClient = {
  listProducts(): Promise<StripeProduct[]>;
  createProduct(params: StripeProductParams): Promise<StripeProduct>;
  updateProduct(id: string, params: StripeProductUpdateParams): Promise<StripeProduct>;
  listPricesByLookupKey(lookupKey: string): Promise<StripePrice[]>;
  createPrice(params: StripePriceParams): Promise<StripePrice>;
  updatePrice(id: string, params: StripePriceUpdateParams): Promise<StripePrice>;
  listPortalConfigurations(): Promise<StripePortalConfiguration[]>;
  createPortalConfiguration(params: StripePortalConfigurationParams): Promise<StripePortalConfiguration>;
  updatePortalConfiguration(id: string, params: StripePortalConfigurationParams): Promise<StripePortalConfiguration>;
  listWebhookEndpoints(): Promise<StripeWebhookEndpoint[]>;
  createWebhookEndpoint(params: StripeWebhookEndpointParams): Promise<StripeWebhookEndpoint>;
  updateWebhookEndpoint(id: string, params: StripeWebhookEndpointParams): Promise<StripeWebhookEndpoint>;
};

export type StripeSyncOptions = {
  execute?: boolean;
  allowLive?: boolean;
  env?: Record<string, string | undefined>;
};

export type StripeSyncResult = {
  execute: boolean;
  accounts: StripeAccountSyncResult[];
};

export type StripeAccountSyncResult = {
  accountAlias: string;
  operations: StripeOperation[];
  warnings: string[];
};

export type StripeOperation = {
  kind: 'create' | 'update' | 'replace' | 'noop';
  resource: 'product' | 'price' | 'portal' | 'webhook';
  accountAlias: string;
  message: string;
  executed: boolean;
  stripeId?: string;
};

type StripeProduct = {
  id: string;
  name: string;
  active?: boolean;
  metadata?: StripeMetadata | null;
};

type StripePrice = {
  id: string;
  active?: boolean;
  currency: string;
  lookup_key?: string | null;
  metadata?: StripeMetadata | null;
  nickname?: string | null;
  product?: string | { id: string };
  recurring?: {
    interval?: string;
    usage_type?: string;
  } | null;
  unit_amount?: number | null;
};

type StripePortalConfiguration = {
  id: string;
  active?: boolean;
  business_profile?: {
    headline?: string | null;
    privacy_policy_url?: string | null;
    terms_of_service_url?: string | null;
  } | null;
  features?: Record<string, unknown> | null;
  metadata?: StripeMetadata | null;
  name?: string | null;
};

type StripeWebhookEndpoint = {
  id: string;
  enabled_events: string[];
  metadata?: StripeMetadata | null;
  url: string;
};

type StripeMetadata = Record<string, string>;

type StripeProductParams = {
  active: boolean;
  metadata: StripeMetadata;
  name: string;
};

type StripeProductUpdateParams = Partial<StripeProductParams>;

type StripePriceParams = {
  active: boolean;
  currency: string;
  lookup_key: string;
  metadata: StripeMetadata;
  nickname: string;
  product?: string;
  recurring?: {
    interval: 'month' | 'year';
    usage_type?: 'licensed' | 'metered';
  };
  transfer_lookup_key?: boolean;
  unit_amount: number;
};

type StripePriceUpdateParams = {
  active?: boolean;
  metadata?: StripeMetadata;
  nickname?: string;
};

type StripePortalConfigurationParams = {
  business_profile: {
    headline: string;
    privacy_policy_url?: string;
    terms_of_service_url?: string;
  };
  features: {
    customer_update: {
      allowed_updates: Array<'email' | 'tax_id'>;
      enabled: boolean;
    };
    invoice_history: {
      enabled: boolean;
    };
    payment_method_update: {
      enabled: boolean;
    };
  };
  metadata: StripeMetadata;
  name: string;
};

type StripeWebhookEndpointParams = {
  description: string;
  enabled_events: string[];
  metadata: StripeMetadata;
  url: string;
};

type DesiredPrice = {
  amount: number;
  kind: 'monthly' | 'yearly' | 'one_time' | 'usage';
  label: string;
  lookupKey: string;
  product: ProductConfig;
  unitAmount: number;
};

const MANAGED_BY = 'billply';

export async function syncStripeConfig(
  config: BillplyConfig,
  clientFactory: StripeBillingClientFactory,
  options: StripeSyncOptions = {}
): Promise<StripeSyncResult> {
  const execute = Boolean(options.execute);
  const env = options.env ?? process.env;
  const accounts: StripeAccountSyncResult[] = [];

  for (const account of accountsUsedByApps(config)) {
    const apiKey = resolveApiKey(account, env, options);
    const client = clientFactory(account, apiKey);
    const apps = config.apps.filter((app) => app.stripeAccount === account.alias);
    accounts.push(await syncStripeAccount(account, apps, client, execute));
  }

  return { execute, accounts };
}

export function renderStripeSyncResult(result: StripeSyncResult): string {
  const lines: string[] = [];

  for (const account of result.accounts) {
    lines.push(`# Stripe account: ${account.accountAlias}`);

    for (const warning of account.warnings) {
      lines.push(`! ${warning}`);
    }

    for (const operation of account.operations) {
      lines.push(`${operationMarker(operation)} ${operation.message}${operation.executed ? ' (executed)' : ''}`);
    }

    lines.push('');
  }

  if (!hasStripeChanges(result)) {
    lines.push('Stripe account matches billply config');
  } else if (!result.execute) {
    lines.push('Dry run only. Re-run apply with --execute to write changes.');
  } else {
    lines.push('Stripe changes applied');
  }

  return lines.join('\n').trimEnd();
}

export function hasStripeChanges(result: StripeSyncResult): boolean {
  return result.accounts.some((account) => account.operations.some((operation) => operation.kind !== 'noop'));
}

function accountsUsedByApps(config: BillplyConfig): AccountConfig[] {
  const aliases = new Set(config.apps.map((app) => app.stripeAccount));
  return Object.values(config.accounts).filter((account) => aliases.has(account.alias));
}

function resolveApiKey(
  account: AccountConfig,
  env: Record<string, string | undefined>,
  options: StripeSyncOptions
): string {
  if (!account.apiKeyEnv) {
    throw new ConfigError([`accounts.${account.alias}.api_key_env is required for Stripe operations.`]);
  }

  const apiKey = env[account.apiKeyEnv];
  if (!apiKey) {
    throw new ConfigError([`Environment variable ${account.apiKeyEnv} is required for account "${account.alias}".`]);
  }

  if (isLiveKey(apiKey) && !options.allowLive) {
    throw new ConfigError([`Environment variable ${account.apiKeyEnv} contains a live Stripe key. Re-run with --live to allow live Stripe access.`]);
  }

  return apiKey;
}

async function syncStripeAccount(
  account: AccountConfig,
  apps: AppConfig[],
  client: StripeBillingClient,
  execute: boolean
): Promise<StripeAccountSyncResult> {
  const operations: StripeOperation[] = [];
  const warnings: string[] = [];
  const products = await client.listProducts();
  const portalConfigurations = await client.listPortalConfigurations();
  const webhookEndpoints = await client.listWebhookEndpoints();

  for (const app of apps) {
    const productIds = new Map<string, string>();

    for (const product of app.products) {
      const productResult = await ensureProduct(account, app, product, products, client, execute);
      operations.push(productResult.operation);

      if (productResult.product) {
        productIds.set(productKey(app, product), productResult.product.id);
        upsertById(products, productResult.product);
      }

      for (const price of desiredPrices(app, product)) {
        const priceResult = await ensurePrice(account, app, price, productResult.product?.id, client, execute);
        operations.push(priceResult);
      }
    }

    operations.push(await ensurePortalConfiguration(account, app, portalConfigurations, client, execute));

    for (const webhook of app.webhooks) {
      operations.push(await ensureWebhookEndpoint(account, app, webhook, webhookEndpoints, client, execute));
    }

    if (productIds.size === 0) {
      warnings.push(`${app.name} has no Stripe product ids after sync planning.`);
    }
  }

  return { accountAlias: account.alias, operations, warnings };
}

async function ensureProduct(
  account: AccountConfig,
  app: AppConfig,
  product: ProductConfig,
  products: StripeProduct[],
  client: StripeBillingClient,
  execute: boolean
): Promise<{ operation: StripeOperation; product?: StripeProduct }> {
  const metadata = productMetadata(app, product);
  const name = productDisplayName(app, product);
  const existing = products.find((item) => item.metadata?.billply_key === metadata.billply_key)
    ?? products.find((item) => item.name === name);

  if (!existing) {
    if (!execute) {
      return {
        operation: operation('create', 'product', account.alias, `Create product ${name}`, false)
      };
    }

    const created = await client.createProduct({ active: true, metadata, name });
    return {
      operation: operation('create', 'product', account.alias, `Create product ${name}`, true, created.id),
      product: created
    };
  }

  const needsUpdate = existing.name !== name
    || existing.active === false
    || !metadataIncludes(existing.metadata, metadata);

  if (!needsUpdate) {
    return {
      operation: operation('noop', 'product', account.alias, `Product ${name} is current`, false, existing.id),
      product: existing
    };
  }

  if (!execute) {
    return {
      operation: operation('update', 'product', account.alias, `Update product ${name}`, false, existing.id),
      product: existing
    };
  }

  const updated = await client.updateProduct(existing.id, { active: true, metadata, name });
  return {
    operation: operation('update', 'product', account.alias, `Update product ${name}`, true, updated.id),
    product: updated
  };
}

async function ensurePrice(
  account: AccountConfig,
  app: AppConfig,
  desired: DesiredPrice,
  productId: string | undefined,
  client: StripeBillingClient,
  execute: boolean
): Promise<StripeOperation> {
  const existing = (await client.listPricesByLookupKey(desired.lookupKey))[0];
  const metadata = priceMetadata(app, desired.product, desired);
  const nickname = `${productDisplayName(app, desired.product)} ${desired.label}`;
  const params = priceParams(desired, metadata, nickname, productId);

  if (!existing) {
    if (!execute) {
      return operation('create', 'price', account.alias, `Create ${desired.label} price ${formatAmount(desired.amount, desired.product.currency)} for ${desired.product.name}`, false);
    }

    const created = await client.createPrice(params);
    return operation('create', 'price', account.alias, `Create ${desired.label} price ${formatAmount(desired.amount, desired.product.currency)} for ${desired.product.name}`, true, created.id);
  }

  if (!priceConfigurationMatches(existing, desired, productId)) {
    if (!execute) {
      return operation('replace', 'price', account.alias, `Replace ${desired.label} price for ${desired.product.name}`, false, existing.id);
    }

    const created = await client.createPrice({ ...params, transfer_lookup_key: true });
    await client.updatePrice(existing.id, { active: false, metadata: { ...existing.metadata, billply_replaced_by: created.id } });
    return operation('replace', 'price', account.alias, `Replace ${desired.label} price for ${desired.product.name}`, true, created.id);
  }

  const needsUpdate = existing.active === false
    || existing.nickname !== nickname
    || !metadataIncludes(existing.metadata, metadata);

  if (!needsUpdate) {
    return operation('noop', 'price', account.alias, `${desired.label} price for ${desired.product.name} is current`, false, existing.id);
  }

  if (!execute) {
    return operation('update', 'price', account.alias, `Update ${desired.label} price metadata for ${desired.product.name}`, false, existing.id);
  }

  const updated = await client.updatePrice(existing.id, { active: true, metadata, nickname });
  return operation('update', 'price', account.alias, `Update ${desired.label} price metadata for ${desired.product.name}`, true, updated.id);
}

async function ensurePortalConfiguration(
  account: AccountConfig,
  app: AppConfig,
  configurations: StripePortalConfiguration[],
  client: StripeBillingClient,
  execute: boolean
): Promise<StripeOperation> {
  const metadata = appMetadata(app);
  const params = portalConfigurationParams(app, metadata);
  const existing = configurations.find((item) => item.metadata?.billply_key === metadata.billply_key)
    ?? configurations.find((item) => item.name === params.name);

  if (!existing) {
    if (!execute) {
      return operation('create', 'portal', account.alias, `Create customer portal configuration for ${app.name}`, false);
    }

    const created = await client.createPortalConfiguration(params);
    return operation('create', 'portal', account.alias, `Create customer portal configuration for ${app.name}`, true, created.id);
  }

  if (!portalConfigurationMatches(existing, params)) {
    if (!execute) {
      return operation('update', 'portal', account.alias, `Update customer portal configuration for ${app.name}`, false, existing.id);
    }

    const updated = await client.updatePortalConfiguration(existing.id, params);
    return operation('update', 'portal', account.alias, `Update customer portal configuration for ${app.name}`, true, updated.id);
  }

  return operation('noop', 'portal', account.alias, `Customer portal configuration for ${app.name} is current`, false, existing.id);
}

async function ensureWebhookEndpoint(
  account: AccountConfig,
  app: AppConfig,
  webhook: WebhookConfig,
  endpoints: StripeWebhookEndpoint[],
  client: StripeBillingClient,
  execute: boolean
): Promise<StripeOperation> {
  const metadata = webhookMetadata(app, webhook);
  const params = webhookEndpointParams(app, webhook, metadata);
  const existing = endpoints.find((item) => item.metadata?.billply_key === metadata.billply_key)
    ?? endpoints.find((item) => item.url === webhook.url);

  if (!existing) {
    if (!execute) {
      return operation('create', 'webhook', account.alias, `Create webhook endpoint ${webhook.url}`, false);
    }

    const created = await client.createWebhookEndpoint(params);
    return operation('create', 'webhook', account.alias, `Create webhook endpoint ${webhook.url}`, true, created.id);
  }

  if (!webhookEndpointMatches(existing, params)) {
    if (!execute) {
      return operation('update', 'webhook', account.alias, `Update webhook endpoint ${webhook.url}`, false, existing.id);
    }

    const updated = await client.updateWebhookEndpoint(existing.id, params);
    return operation('update', 'webhook', account.alias, `Update webhook endpoint ${webhook.url}`, true, updated.id);
  }

  return operation('noop', 'webhook', account.alias, `Webhook endpoint ${webhook.url} is current`, false, existing.id);
}

function productDisplayName(app: AppConfig, product: ProductConfig): string {
  return `${app.name} / ${product.name}`;
}

function productMetadata(app: AppConfig, product: ProductConfig): StripeMetadata {
  return {
    billply_managed: 'true',
    billply_type: 'product',
    billply_app: app.name,
    billply_product: product.name,
    billply_key: productKey(app, product)
  };
}

function priceMetadata(app: AppConfig, product: ProductConfig, price: DesiredPrice): StripeMetadata {
  return {
    ...productMetadata(app, product),
    billply_type: 'price',
    billply_price_kind: price.kind,
    billply_price_key: price.lookupKey
  };
}

function appMetadata(app: AppConfig): StripeMetadata {
  return {
    billply_managed: 'true',
    billply_type: 'portal',
    billply_app: app.name,
    billply_key: appKey(app)
  };
}

function webhookMetadata(app: AppConfig, webhook: WebhookConfig): StripeMetadata {
  return {
    billply_managed: 'true',
    billply_type: 'webhook',
    billply_app: app.name,
    billply_key: `${appKey(app)}-${slugify(webhook.url)}`
  };
}

function desiredPrices(app: AppConfig, product: ProductConfig): DesiredPrice[] {
  return [
    product.monthlyPrice === undefined ? undefined : desiredPrice(app, product, 'monthly', 'monthly recurring', product.monthlyPrice),
    product.yearlyPrice === undefined ? undefined : desiredPrice(app, product, 'yearly', 'yearly recurring', product.yearlyPrice),
    product.oneTimePrice === undefined ? undefined : desiredPrice(app, product, 'one_time', 'one-time', product.oneTimePrice),
    product.usagePrice === undefined ? undefined : desiredPrice(app, product, 'usage', 'usage-based', product.usagePrice)
  ].filter((price): price is DesiredPrice => price !== undefined);
}

function desiredPrice(
  app: AppConfig,
  product: ProductConfig,
  kind: DesiredPrice['kind'],
  label: string,
  amount: number
): DesiredPrice {
  return {
    amount,
    kind,
    label,
    lookupKey: lookupKey(app, product, kind),
    product,
    unitAmount: amountToMinorUnits(amount)
  };
}

function priceParams(
  desired: DesiredPrice,
  metadata: StripeMetadata,
  nickname: string,
  productId: string | undefined
): StripePriceParams {
  const params: StripePriceParams = {
    active: true,
    currency: desired.product.currency.toLowerCase(),
    lookup_key: desired.lookupKey,
    metadata,
    nickname,
    product: productId,
    unit_amount: desired.unitAmount
  };

  if (desired.kind === 'monthly') {
    params.recurring = { interval: 'month', usage_type: 'licensed' };
  }

  if (desired.kind === 'yearly') {
    params.recurring = { interval: 'year', usage_type: 'licensed' };
  }

  if (desired.kind === 'usage') {
    params.recurring = { interval: 'month', usage_type: 'metered' };
  }

  return params;
}

function portalConfigurationParams(app: AppConfig, metadata: StripeMetadata): StripePortalConfigurationParams {
  return {
    business_profile: {
      headline: `${app.name} billing`,
      privacy_policy_url: app.privacyUrl,
      terms_of_service_url: app.termsUrl
    },
    features: {
      customer_update: {
        allowed_updates: ['email', 'tax_id'],
        enabled: true
      },
      invoice_history: {
        enabled: true
      },
      payment_method_update: {
        enabled: true
      }
    },
    metadata,
    name: `${app.name} billing portal`
  };
}

function webhookEndpointParams(app: AppConfig, webhook: WebhookConfig, metadata: StripeMetadata): StripeWebhookEndpointParams {
  return {
    description: `${app.name} billply webhook`,
    enabled_events: [...webhook.events].sort(),
    metadata,
    url: webhook.url
  };
}

function priceConfigurationMatches(existing: StripePrice, desired: DesiredPrice, productId: string | undefined): boolean {
  return existing.active !== false
    && existing.currency.toLowerCase() === desired.product.currency.toLowerCase()
    && existing.lookup_key === desired.lookupKey
    && existing.unit_amount === desired.unitAmount
    && recurringMatches(existing, desired)
    && (!productId || stripeId(existing.product) === productId);
}

function recurringMatches(existing: StripePrice, desired: DesiredPrice): boolean {
  if (desired.kind === 'one_time') {
    return !existing.recurring;
  }

  if (!existing.recurring) {
    return false;
  }

  if (desired.kind === 'monthly') {
    return existing.recurring.interval === 'month' && (existing.recurring.usage_type ?? 'licensed') === 'licensed';
  }

  if (desired.kind === 'yearly') {
    return existing.recurring.interval === 'year' && (existing.recurring.usage_type ?? 'licensed') === 'licensed';
  }

  return existing.recurring.interval === 'month' && existing.recurring.usage_type === 'metered';
}

function portalConfigurationMatches(existing: StripePortalConfiguration, desired: StripePortalConfigurationParams): boolean {
  return existing.active !== false
    && existing.name === desired.name
    && existing.business_profile?.headline === desired.business_profile.headline
    && nullable(existing.business_profile?.privacy_policy_url) === nullable(desired.business_profile.privacy_policy_url)
    && nullable(existing.business_profile?.terms_of_service_url) === nullable(desired.business_profile.terms_of_service_url)
    && metadataIncludes(existing.metadata, desired.metadata);
}

function webhookEndpointMatches(existing: StripeWebhookEndpoint, desired: StripeWebhookEndpointParams): boolean {
  return existing.url === desired.url
    && sameStringSet(existing.enabled_events, desired.enabled_events)
    && metadataIncludes(existing.metadata, desired.metadata);
}

function metadataIncludes(actual: StripeMetadata | null | undefined, expected: StripeMetadata): boolean {
  return Object.entries(expected).every(([key, value]) => actual?.[key] === value);
}

function operation(
  kind: StripeOperation['kind'],
  resource: StripeOperation['resource'],
  accountAlias: string,
  message: string,
  executed: boolean,
  stripeId?: string
): StripeOperation {
  return { kind, resource, accountAlias, message, executed, stripeId };
}

function operationMarker(operation: StripeOperation): string {
  if (operation.kind === 'noop') {
    return '=';
  }

  if (operation.kind === 'create') {
    return '+';
  }

  return '~';
}

function upsertById<T extends { id: string }>(items: T[], next: T): void {
  const index = items.findIndex((item) => item.id === next.id);
  if (index === -1) {
    items.push(next);
    return;
  }

  items[index] = next;
}

function productKey(app: AppConfig, product: ProductConfig): string {
  return slugify(`${app.name}-${product.lookupKey ?? product.name}`);
}

function appKey(app: AppConfig): string {
  return slugify(app.name);
}

function lookupKey(app: AppConfig, product: ProductConfig, kind: string): string {
  return slugify(`${app.name}-${product.lookupKey ?? product.name}-${kind}`);
}

function stripeId(value: string | { id: string } | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  return typeof value === 'string' ? value : value.id;
}

function sameStringSet(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((item) => right.includes(item));
}

function nullable(value: string | null | undefined): string | undefined {
  return value ?? undefined;
}

function amountToMinorUnits(amount: number): number {
  return Math.round(amount * 100);
}

function formatAmount(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase()
    }).format(amount);
  } catch {
    return `${amount} ${currency.toUpperCase()}`;
  }
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function isLiveKey(value: string): boolean {
  return value.startsWith('sk_live_') || value.startsWith('rk_live_');
}
