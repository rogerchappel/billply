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

test('parseConfig rejects an invalid app currency', () => {
  assert.throws(
    () => parseConfig(validConfig.replace('    products:', '    currency: definitely-not-a-currency\n    products:')),
    (error) => {
      assert.ok(error instanceof ConfigError);
      assert.deepEqual(error.issues, [
        'apps[0].currency must be a three-letter ISO currency code when provided.'
      ]);
      return true;
    }
  );
});

test('parseConfig rejects an invalid product currency override', () => {
  assert.throws(
    () => parseConfig(validConfig.replace('        monthly_price: 29', '        currency: dollars\n        monthly_price: 29')),
    (error) => {
      assert.ok(error instanceof ConfigError);
      assert.deepEqual(error.issues, [
        'apps[0].products[0].currency must be a three-letter ISO currency code when provided.'
      ]);
      return true;
    }
  );
});

test('parseConfig accepts and normalizes three-letter currency codes', () => {
  const config = parseConfig(
    validConfig
      .replace('    products:', '    currency: EUR\n    products:')
      .replace('        monthly_price: 29', '        currency: JpY\n        monthly_price: 29')
  );

  assert.equal(config.apps[0].currency, 'eur');
  assert.equal(config.apps[0].products[0].currency, 'jpy');
});

test('parseConfig gives products the normalized app currency by default', () => {
  const config = parseConfig(validConfig.replace('    products:', '    currency: AUD\n    products:'));

  assert.equal(config.apps[0].products[0].currency, 'aud');
  assert.equal(config.apps[0].products[1].currency, 'aud');
});

test('parseConfig rejects amounts finer than the currency minor unit', () => {
  assert.throws(
    () => parseConfig(validConfig
      .replace('        monthly_price: 29', '        currency: JPY\n        monthly_price: 29.5')),
    (error) => {
      assert.ok(error instanceof ConfigError);
      assert.match(error.message, /monthly_price cannot have more than 0 decimal places for JPY/);
      return true;
    }
  );
});

test('parseConfig accepts three-decimal amounts for Stripe three-decimal currencies', () => {
  for (const currency of ['BHD', 'JOD', 'KWD', 'OMR', 'TND']) {
    const config = parseConfig(validConfig
      .replace('        monthly_price: 29', `        currency: ${currency}\n        monthly_price: 1.234`));

    assert.equal(config.apps[0].products[0].monthlyPrice, 1.234);
  }
});

test('parseConfig rejects excess precision for Stripe three-decimal currencies', () => {
  assert.throws(
    () => parseConfig(validConfig
      .replace('        monthly_price: 29', '        currency: KWD\n        monthly_price: 1.2345')),
    (error) => {
      assert.ok(error instanceof ConfigError);
      assert.match(error.message, /monthly_price cannot have more than 3 decimal places for KWD/);
      return true;
    }
  );
});

test('parseConfig rejects malformed and non-HTTP webhook URLs', () => {
  for (const url of ['not-a-url', 'ftp://example.com/webhook']) {
    assert.throws(
      () => parseConfig(validConfig.replace('https://leadfinder.ai/api/stripe/webhook', url)),
      (error) => {
        assert.ok(error instanceof ConfigError);
        assert.match(error.message, /url must be a valid HTTP or HTTPS URL/);
        return true;
      }
    );
  }
});

test('parseConfig rejects empty and malformed webhook event identifiers', () => {
  for (const event of ["''", 'not.a.real.event!', 'checkout']) {
    assert.throws(
      () => parseConfig(validConfig.replace('checkout.session.completed', event)),
      (error) => {
        assert.ok(error instanceof ConfigError);
        assert.match(error.message, /events\[0\] must be a valid Stripe event identifier/);
        return true;
      }
    );
  }
});

test('parseConfig rejects duplicate derived lookup and runtime keys', () => {
  assert.throws(
    () => parseConfig(validConfig.replace(
      '      - name: Pro',
      '      - name: Starter\n        monthly_price: 49\n      - name: Pro'
    )),
    (error) => {
      assert.ok(error instanceof ConfigError);
      assert.match(error.message, /duplicate Stripe lookup key "leadfinder-ai-starter-monthly"/);
      assert.match(error.message, /duplicate runtime environment variable "STRIPE_LEADFINDER_AI_STARTER_MONTHLY_LOOKUP_KEY"/);
      return true;
    }
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
