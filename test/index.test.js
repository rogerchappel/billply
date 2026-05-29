import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ConfigError,
  buildPlan,
  exportRuntimeEnv,
  parseConfig,
  renderPlan,
  verifyConfig
} from '../dist/index.js';

const validConfig = `
accounts:
  leadfinder:
    account_id: acct_xxx
    environment: test
    api_key_env: STRIPE_LEADFINDER_API_KEY

apps:
  - name: LeadFinder AI
    stripe_account: leadfinder
    support_email: support@leadfinder.ai
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
          - checkout.session.completed
`;

test('parseConfig normalizes accounts, apps, products, and webhooks', () => {
  const config = parseConfig(validConfig);

  assert.equal(config.accounts.leadfinder.accountId, 'acct_xxx');
  assert.equal(config.apps[0].name, 'LeadFinder AI');
  assert.equal(config.apps[0].currency, 'usd');
  assert.equal(config.apps[0].products[1].yearlyPrice, 990);
  assert.equal(config.apps[0].webhooks[0].events[0], 'checkout.session.completed');
});

test('parseConfig rejects unknown account references', () => {
  assert.throws(
    () => parseConfig(`
accounts:
  leadfinder:
    account_id: acct_xxx
apps:
  - name: Estimator
    stripe_account: missing
    products:
      - name: Pro
        monthly_price: 49
`),
    ConfigError
  );
});

test('buildPlan renders a non-destructive local plan', () => {
  const plan = buildPlan(parseConfig(validConfig));
  const output = renderPlan(plan);

  assert.equal(plan.destructiveChanges.length, 0);
  assert.match(output, /Use Stripe account leadfinder \(acct_xxx\)/);
  assert.match(output, /Create monthly recurring price \$29\.00 for Starter/);
  assert.match(output, /No destructive changes/);
});

test('exportRuntimeEnv derives deterministic lookup keys without secrets', () => {
  const env = exportRuntimeEnv(parseConfig(validConfig));

  assert.match(env, /STRIPE_LEADFINDER_ACCOUNT_ID=acct_xxx/);
  assert.match(env, /STRIPE_LEADFINDER_AI_PRO_YEARLY_LOOKUP_KEY=leadfinder-ai-pro-yearly/);
  assert.doesNotMatch(env, /sk_/);
});

test('verifyConfig warns when an app has no webhooks', () => {
  const config = parseConfig(`
accounts:
  leadfinder:
    account_id: acct_xxx
apps:
  - name: LeadFinder AI
    stripe_account: leadfinder
    products:
      - name: Starter
        monthly_price: 29
`);

  assert.deepEqual(verifyConfig(config), ['LeadFinder AI has no webhooks configured.']);
});
