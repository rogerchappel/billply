# billply

Infrastructure-as-code CLI for Stripe SaaS billing.

## Status

This repository is early-stage. It parses local config, produces local plans,
validates references, exports deterministic runtime names, and includes a
guarded Stripe adapter for supported setup automation.

Billply exists to make Stripe account setup repeatable as code. The target user
is an indie hacker, agency, or small SaaS studio managing several products and
Stripe accounts who wants to avoid spending an hour clicking through the Stripe
Dashboard for each new product.

The current MVP is safe by default: local commands do not call Stripe, Stripe
reads require `--stripe`, and Stripe writes require `apply --execute`.

## Install

Install the CLI package:

```sh
npm install -g billply
```

For local development:

```sh
pnpm install
pnpm build
```

## Use

Create a `billply.yaml` file:

```yaml
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
          - customer.subscription.updated
```

Run the local planner:

```sh
billply plan --config billply.yaml
billply verify --config billply.yaml
billply export --config billply.yaml
```

From a source checkout:

```sh
pnpm exec tsx src/cli.ts plan --config billply.yaml
pnpm exec tsx src/cli.ts verify --config billply.yaml
pnpm exec tsx src/cli.ts export --config billply.yaml
```

Compare against Stripe or apply supported setup:

```sh
pnpm exec tsx src/cli.ts plan --stripe --config billply.yaml
pnpm exec tsx src/cli.ts verify --stripe --config billply.yaml
pnpm exec tsx src/cli.ts apply --config billply.yaml
pnpm exec tsx src/cli.ts apply --execute --config billply.yaml
```

`apply` without `--execute` is a Stripe-backed dry run. `apply --execute`
creates or updates supported Stripe resources. Live keys are refused unless
`--live` is also passed.

## Stripe Authentication

The local planner does not authenticate to Stripe. Commands that use Stripe
(`plan --stripe`, `verify --stripe`, and `apply`) read the environment variable
named by `accounts.<alias>.api_key_env`.

Authenticate like this:

1. Create or choose a Stripe testing environment first.
   Use a Stripe sandbox or test mode for development. Stripe test API keys
   create simulated objects and do not move real money. Live mode keys affect
   real account data and real payments.
   Source: https://docs.stripe.com/test-mode

2. Create a restricted key when possible.
   Stripe recommends restricted API keys over broad secret keys where a task
   only needs limited permissions. Use read permissions for `plan --stripe` and
   `verify --stripe`; use write permissions only when running `apply --execute`.
   Sources:
   - https://docs.stripe.com/keys
   - https://docs.stripe.com/keys-best-practices

3. Store the key outside the repo.
   Do not put secret or restricted API key values in `billply.yaml`, `.env`
   files committed to git, README examples, issue comments, CI logs, or
   screenshots. Use a password manager, cloud secrets manager, CI secret store,
   or local environment variable.

4. Reference only the environment variable name in `billply.yaml`.

   ```yaml
   accounts:
     leadfinder:
       account_id: acct_xxx
       environment: sandbox
       api_key_env: STRIPE_LEADFINDER_API_KEY
   ```

5. Export the key in your shell only when running a Stripe-backed command:

   ```sh
   export STRIPE_LEADFINDER_API_KEY=<test_or_restricted_key_from_dashboard>
   ```

   Use a real key from your Stripe Dashboard or secrets manager. Do not paste a
   real key into documentation or commit history.

6. Prefer separate variables per Stripe account.
   If you manage several SaaS products, use names like
   `STRIPE_LEADFINDER_API_KEY`, `STRIPE_ESTIMATOR_API_KEY`, and
   `STRIPE_CLIENT_A_API_KEY`. This keeps account intent clear and makes key
   rotation easier.

7. Use Stripe CLI authentication for manual development checks, not as billply
   config.
   The Stripe CLI can authenticate with `stripe login`, which creates
   restricted keys stored locally by the Stripe CLI. It is useful for manually
   inspecting Stripe resources, forwarding webhooks, and triggering test
   events. Billply should not depend on the Stripe CLI's local config unless a
   future feature explicitly documents that behavior.
   Sources:
   - https://docs.stripe.com/stripe-cli/install
   - https://docs.stripe.com/stripe-cli/keys

Useful manual Stripe CLI checks:

```sh
stripe login
stripe products list --limit 3
stripe prices list --limit 3
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

If Stripe CLI auth is not available, use Dashboard-created API keys in
environment variables instead. Stripe's API authentication docs explain that API
keys authenticate requests, and that test and live keys determine whether a
request targets test data or live data.
Source: https://docs.stripe.com/api/authentication

## Current MVP

Billply can do these things today:

- Parse a local `billply.yaml` file.
- Validate that apps reference known account aliases.
- Plan products, prices, customer portal defaults, checkout defaults, and
  webhook endpoint intent without touching Stripe.
- Compare config against Stripe with `plan --stripe` and `verify --stripe`.
- Apply supported Stripe setup with `apply --execute`.
- Export deterministic environment variable names and lookup keys.
- Refuse live Stripe keys unless `--live` is explicitly passed.

The current MVP does not do these things yet:

- Create Checkout Sessions or Payment Links.
- Retrieve or print webhook signing secrets.
- Delete Stripe resources.
- Archive products automatically when they are removed from YAML.
- Manage API keys, secrets, team access, account activation, payout settings,
  payment method preferences, tax obligations, legal policies, or compliance
  decisions.

## Manual Stripe Setup

Some work will remain manual even when billply can automate most repeatable
Stripe setup. Stripe requires account owners to verify business details and
complete live account requirements before processing real payments. Stripe also
recommends completing its live account checklist, including two-factor
authentication, statement descriptor review, notification settings,
fraud/dispute readiness, bank account review, team access, and
restricted-business review. See Stripe's account setup and account checklist
docs:

- https://docs.stripe.com/get-started/account/set-up
- https://docs.stripe.com/get-started/account/checklist

For a new SaaS product, do these manually in Stripe before relying on any
automation:

1. Create or choose the correct Stripe account.
   Use separate Stripe accounts for independent projects, websites, or
   businesses. Billply can record account aliases, but it should not decide the
   legal entity, tax ID, or account split for you.
   Source: https://docs.stripe.com/get-started/account/multiple-accounts

2. Activate the account for live mode.
   Sandboxes can be used for testing without moving money, but live payments
   require business verification and any Stripe service requirements.
   Source: https://docs.stripe.com/get-started/account/set-up

3. Confirm public business information.
   Customers see business name, website URL, support contact details, support
   site URL, and statement descriptor information. Review these in the
   Dashboard so charges are recognizable and disputes are less likely.
   Source: https://docs.stripe.com/get-started/account/set-up

4. Configure payout and banking details.
   Confirm payout bank details, payout schedule, and any linked external
   account requests in the Dashboard. Billply should never collect bank login
   credentials or mutate production payout settings.
   Sources:
   - https://docs.stripe.com/get-started/account/checklist
   - https://docs.stripe.com/get-started/account/linked-external-accounts

5. Create and store API keys outside the repository.
   Use the Stripe Dashboard to create, reveal, rotate, and restrict API keys.
   Store secret keys in a secrets vault or environment variable. Billply config
   should contain only the name of the environment variable, such as
   `STRIPE_LEADFINDER_API_KEY`, never the key value.
   Sources:
   - https://docs.stripe.com/keys
   - https://docs.stripe.com/keys-best-practices

6. Choose payment methods in the Dashboard.
   Stripe dynamically shows payment methods based on Dashboard preferences and
   eligibility factors such as currency, amount, location, and payment flow.
   Some payment methods need extra setup or terms review. Billply can document
   desired defaults, but the account owner must review what is actually
   available.
   Source: https://docs.stripe.com/payments/checkout/payment-methods

7. Build the application checkout flow.
   Stripe Checkout uses the Checkout Sessions API, but your SaaS application
   still needs routes for creating sessions, success/cancel redirects,
   customer identity, entitlements, and fulfillment. Billply can generate or
   validate references; it does not replace app code.
   Source: https://docs.stripe.com/payments/checkout

8. Deploy and secure webhook receivers.
   Stripe can register webhook endpoints through the API, and most users can
   also configure them in the Dashboard. Your app must still expose an HTTPS
   endpoint, preserve the raw request body, verify `Stripe-Signature`, and
   store the endpoint secret securely. Dashboard endpoint secrets and Stripe
   CLI endpoint secrets are different.
   Sources:
   - https://docs.stripe.com/api/webhook_endpoints
   - https://docs.stripe.com/webhooks/signature

9. Decide legal, tax, and policy details.
   Terms URLs, privacy URLs, refund/support policy, tax registrations, industry
   restrictions, and customer communications are business decisions. Billply can
   require the URLs in config, but it cannot decide whether they are correct.

## Stripe Adapter Scope

Billply currently automates the repeatable Stripe resources below. The adapter
is dry-run-first, idempotent, and marks managed resources with metadata so they
can be found on later runs.

| Area | Supported work | Boundary |
| --- | --- | --- |
| Products | Create and update managed products. | Does not delete products. |
| Prices | Create recurring, one-time, and usage prices. Replaces changed prices by creating a new price and archiving the old price. | Price amounts are effectively versioned: if the amount changes, create a new price and archive the old one. Stripe says used prices cannot be deleted through the API. |
| Customer portal | Create and update billing portal configurations. | Portal sessions still require application logic and real customer IDs. |
| Webhook endpoints | Create and update endpoints and enabled events. | The receiving app, HTTPS deployment, signature verification, and secret storage remain outside billply. |
| Checkout | Export deterministic lookup keys for Checkout integration. | The SaaS app must create sessions at runtime and own fulfillment. |
| Account branding/business profile | Some connected-account fields are API-updatable. | Stripe says updating your own account should be done in the Dashboard. |

Useful Stripe references:

- Products and prices: https://docs.stripe.com/products-prices/manage-prices
- Products API: https://docs.stripe.com/api/products
- Prices API: https://docs.stripe.com/api/prices
- Customer portal configurations API:
  https://docs.stripe.com/api/customer_portal/configurations
- Webhook endpoints API: https://docs.stripe.com/api/webhook_endpoints
- Accounts API boundary: https://docs.stripe.com/api/accounts/update

## Test

Run the full local validation path:

```sh
pnpm install
bash scripts/validate.sh
```

That runs the TypeScript check, tests, build, release check, package dry-run,
and the local smoke script when present.

Run the commands directly against the example config:

```sh
pnpm exec tsx src/cli.ts plan --config examples/billply.yaml
pnpm exec tsx src/cli.ts verify --config examples/billply.yaml
pnpm exec tsx src/cli.ts export --config examples/billply.yaml
```

Expected results:

- `plan` prints planned resources and ends with `No destructive changes`.
- `verify` prints `Config valid`.
- `export` prints deterministic names such as
  `STRIPE_LEADFINDER_AI_PRO_MONTHLY_LOOKUP_KEY=leadfinder-ai-pro-monthly`.

Test an invalid reference:

```sh
cat > /tmp/bad-billply.yaml <<'YAML'
accounts:
  leadfinder:
    account_id: acct_xxx
apps:
  - name: Estimator
    stripe_account: missing
    products:
      - name: Pro
        monthly_price: 49
YAML

pnpm exec tsx src/cli.ts verify --config /tmp/bad-billply.yaml
```

Expected result: the command exits non-zero and reports that
`apps[0].stripe_account` references an unknown account.

Do not use a live Stripe API key for routine tests. The repository test suite
uses mocked Stripe clients and does not need real credentials.

To test Stripe authentication without touching live data:

1. Create a sandbox or use test mode in Stripe.
2. Create a restricted test key with the minimum permissions required by the
   feature under test.
3. Export it in the current shell, for example:

   ```sh
   export STRIPE_LEADFINDER_API_KEY=<test_or_restricted_key_from_dashboard>
   ```

4. Keep the YAML value as the environment variable name:

   ```yaml
   api_key_env: STRIPE_LEADFINDER_API_KEY
   ```

5. Confirm the key itself never appears in `git diff`, shell history you plan
   to share, CI logs, or PR comments.

Then run a Stripe-backed dry run:

```sh
pnpm exec tsx src/cli.ts plan --stripe --config billply.yaml
pnpm exec tsx src/cli.ts apply --config billply.yaml
```

When the dry run is correct, apply to the test account:

```sh
pnpm exec tsx src/cli.ts apply --execute --config billply.yaml
```

Only use a live key when you intend to touch live Stripe resources:

```sh
pnpm exec tsx src/cli.ts apply --execute --live --config billply.yaml
```

## Verify

Run the local validation script before opening a pull request:

```sh
bash scripts/validate.sh
```

`scripts/validate.sh` runs the repository's standard local checks when they are defined and will also run `agent-qc ready` when `agent-qc` is installed. Missing `agent-qc` is treated as a skip, not a failure.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution expectations. Changes
should be small, reviewable, and verified before review.

## Security

See [SECURITY.md](SECURITY.md) for vulnerability reporting guidance. Replace
the default security policy before publishing the generated repository.

These links assume this README has been copied to the generated repository root.

## License

MIT

## Verification

Run the release-readiness checks before publishing or cutting a PR:

```bash
npm run check
npm run build
npm run test
npm run smoke
npm run package:smoke
npm run release:check
```

Use `npm run package:smoke` or `npm pack --dry-run` to confirm the published tarball includes the support docs and runnable package contents.
