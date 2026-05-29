import Stripe from 'stripe';
import type { AccountConfig } from './index.js';
import type {
  StripeBillingClient,
  StripeBillingClientFactory
} from './stripe-adapter.js';

export const createStripeBillingClient: StripeBillingClientFactory = (_account: AccountConfig, apiKey: string): StripeBillingClient => {
  const stripe = new Stripe(apiKey, {
    appInfo: {
      name: 'billply',
      version: '0.1.0',
      url: 'https://github.com/rogerchappel/billply'
    }
  });

  return {
    async listProducts() {
      return await stripe.products.list({ limit: 100 }).autoPagingToArray({ limit: 10000 });
    },
    async createProduct(params) {
      return await stripe.products.create(params);
    },
    async updateProduct(id, params) {
      return await stripe.products.update(id, params);
    },
    async listPricesByLookupKey(lookupKey) {
      return await stripe.prices.list({ lookup_keys: [lookupKey], limit: 100 }).autoPagingToArray({ limit: 10000 });
    },
    async createPrice(params) {
      return await stripe.prices.create(params);
    },
    async updatePrice(id, params) {
      return await stripe.prices.update(id, params);
    },
    async listPortalConfigurations() {
      return await stripe.billingPortal.configurations.list({ limit: 100 }).autoPagingToArray({ limit: 10000 }) as unknown as Awaited<ReturnType<StripeBillingClient['listPortalConfigurations']>>;
    },
    async createPortalConfiguration(params) {
      return await stripe.billingPortal.configurations.create(params) as unknown as Awaited<ReturnType<StripeBillingClient['createPortalConfiguration']>>;
    },
    async updatePortalConfiguration(id, params) {
      return await stripe.billingPortal.configurations.update(id, params) as unknown as Awaited<ReturnType<StripeBillingClient['updatePortalConfiguration']>>;
    },
    async listWebhookEndpoints() {
      return await stripe.webhookEndpoints.list({ limit: 100 }).autoPagingToArray({ limit: 10000 });
    },
    async createWebhookEndpoint(params) {
      return await stripe.webhookEndpoints.create(params as Stripe.WebhookEndpointCreateParams);
    },
    async updateWebhookEndpoint(id, params) {
      return await stripe.webhookEndpoints.update(id, params as Stripe.WebhookEndpointUpdateParams);
    }
  };
};
