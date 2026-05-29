import assert from 'node:assert/strict';
import test from 'node:test';

import { ConfigError, parseConfig } from '../dist/index.js';
import {
  hasStripeChanges,
  syncStripeConfig
} from '../dist/stripe-adapter.js';

const config = parseConfig(`
accounts:
  leadfinder:
    account_id: acct_xxx
    api_key_env: STRIPE_LEADFINDER_API_KEY
apps:
  - name: LeadFinder AI
    stripe_account: leadfinder
    privacy_url: https://leadfinder.ai/privacy
    terms_url: https://leadfinder.ai/terms
    products:
      - name: Starter
        monthly_price: 29
      - name: Pro
        monthly_price: 99
        yearly_price: 990
    webhooks:
      - url: https://leadfinder.ai/api/stripe/webhook
        events:
          - customer.subscription.updated
          - checkout.session.completed
`);

test('syncStripeConfig dry-runs missing Stripe resources without writes', async () => {
  const client = createFakeStripeClient();
  const result = await syncStripeConfig(config, () => client, {
    env: {
      STRIPE_LEADFINDER_API_KEY: 'sk_test_example'
    }
  });

  assert.equal(hasStripeChanges(result), true);
  assert.equal(client.calls.createProduct.length, 0);
  assert.equal(client.calls.createPrice.length, 0);
  assert.match(result.accounts[0].operations.map((item) => item.message).join('\n'), /Create product LeadFinder AI \/ Starter/);
  assert.match(result.accounts[0].operations.map((item) => item.message).join('\n'), /Create webhook endpoint/);
});

test('syncStripeConfig executes supported Stripe setup and is idempotent', async () => {
  const client = createFakeStripeClient();
  const env = {
    STRIPE_LEADFINDER_API_KEY: 'sk_test_example'
  };

  const applied = await syncStripeConfig(config, () => client, { env, execute: true });

  assert.equal(hasStripeChanges(applied), true);
  assert.equal(client.calls.createProduct.length, 2);
  assert.equal(client.calls.createPrice.length, 3);
  assert.equal(client.calls.createPortalConfiguration.length, 1);
  assert.equal(client.calls.createWebhookEndpoint.length, 1);
  assert.equal(client.calls.createPrice[0].unit_amount, 2900);
  assert.equal(client.calls.createPrice[2].recurring.interval, 'year');

  const secondRun = await syncStripeConfig(config, () => client, { env });

  assert.equal(hasStripeChanges(secondRun), false);
});

test('syncStripeConfig replaces changed prices without deleting old prices', async () => {
  const client = createFakeStripeClient();
  const env = {
    STRIPE_LEADFINDER_API_KEY: 'sk_test_example'
  };

  await syncStripeConfig(config, () => client, { env, execute: true });

  const changed = parseConfig(`
accounts:
  leadfinder:
    account_id: acct_xxx
    api_key_env: STRIPE_LEADFINDER_API_KEY
apps:
  - name: LeadFinder AI
    stripe_account: leadfinder
    products:
      - name: Starter
        monthly_price: 39
`);

  const result = await syncStripeConfig(changed, () => client, { env, execute: true });

  assert.equal(result.accounts[0].operations.some((item) => item.kind === 'replace' && item.resource === 'price'), true);
  assert.equal(client.calls.createPrice.at(-1).transfer_lookup_key, true);
  assert.equal(client.calls.updatePrice.at(-1).active, false);
});

test('syncStripeConfig refuses live keys unless explicitly allowed', async () => {
  await assert.rejects(
    async () => syncStripeConfig(config, () => createFakeStripeClient(), {
      env: {
        STRIPE_LEADFINDER_API_KEY: 'sk_live_example'
      }
    }),
    ConfigError
  );
});

function createFakeStripeClient() {
  let productSequence = 0;
  let priceSequence = 0;
  let portalSequence = 0;
  let webhookSequence = 0;
  const products = [];
  const prices = [];
  const portalConfigurations = [];
  const webhookEndpoints = [];
  const calls = {
    createProduct: [],
    updateProduct: [],
    createPrice: [],
    updatePrice: [],
    createPortalConfiguration: [],
    updatePortalConfiguration: [],
    createWebhookEndpoint: [],
    updateWebhookEndpoint: []
  };

  return {
    calls,
    async listProducts() {
      return products;
    },
    async createProduct(params) {
      calls.createProduct.push(params);
      const product = { id: `prod_${++productSequence}`, ...params };
      products.push(product);
      return product;
    },
    async updateProduct(id, params) {
      calls.updateProduct.push(params);
      return updateById(products, id, params);
    },
    async listPricesByLookupKey(lookupKey) {
      return prices.filter((price) => price.lookup_key === lookupKey);
    },
    async createPrice(params) {
      calls.createPrice.push(params);
      const price = { id: `price_${++priceSequence}`, ...params };
      prices.push(price);
      return price;
    },
    async updatePrice(id, params) {
      calls.updatePrice.push(params);
      return updateById(prices, id, params);
    },
    async listPortalConfigurations() {
      return portalConfigurations;
    },
    async createPortalConfiguration(params) {
      calls.createPortalConfiguration.push(params);
      const portal = { id: `bpc_${++portalSequence}`, active: true, ...params };
      portalConfigurations.push(portal);
      return portal;
    },
    async updatePortalConfiguration(id, params) {
      calls.updatePortalConfiguration.push(params);
      return updateById(portalConfigurations, id, params);
    },
    async listWebhookEndpoints() {
      return webhookEndpoints;
    },
    async createWebhookEndpoint(params) {
      calls.createWebhookEndpoint.push(params);
      const endpoint = { id: `we_${++webhookSequence}`, ...params };
      webhookEndpoints.push(endpoint);
      return endpoint;
    },
    async updateWebhookEndpoint(id, params) {
      calls.updateWebhookEndpoint.push(params);
      return updateById(webhookEndpoints, id, params);
    }
  };
}

function updateById(items, id, params) {
  const index = items.findIndex((item) => item.id === id);
  assert.notEqual(index, -1);
  items[index] = { ...items[index], ...params };
  return items[index];
}
