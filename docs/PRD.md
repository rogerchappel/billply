# Billply
This is actually a pretty compelling product because the pain point is growing rapidly: one founder, many AI SaaS products, many Stripe accounts.  
I'd position it not as "Stripe setup automation" but as **Infrastructure-as-Code for SaaS Billing**.  
## Product Requirements Document (PRD)  
## Product Name  
Billply  
Alternative names:  
* StripeOps  
* SaaS Billing Infrastructure  
* Stripe Terraform  
* BillingOps  
## Vision  
Enable founders and agencies to define Stripe billing infrastructure as code and deploy identical billing configurations across multiple SaaS products and Stripe accounts.  
The product should eliminate repetitive Stripe dashboard setup and provide reproducible, version-controlled billing infrastructure.  
## Problem Statement  
AI-assisted development has dramatically reduced the cost of building SaaS products.  
A single founder may launch:  
* 5 SaaS products  
* 10 SaaS products  
* 20+ SaaS products  
Each product often requires:  
* Separate Stripe account  
* Separate products  
* Separate prices  
* Separate checkout configuration  
* Separate customer portal  
* Separate webhooks  
* Separate branding  
* Separate support URLs  
* Separate legal URLs  
Today these are configured manually through the Stripe dashboard.  
This creates:  
* Repetitive work  
* Human error  
* Inconsistent configurations  
* Difficult auditing  
* Difficult replication  
## Target Users  
**Primary**  
Indie hackers  
**Secondary**  
AI startup studios  
**Tertiary**  
Agencies launching SaaS products for clients  
**Quaternary**  
Portfolio SaaS operators managing multiple Stripe accounts  
  
---  
  
## Product Goals  
## Goal 1  
Provision Stripe billing infrastructure from configuration files.  
## Goal 2  
Support dozens of SaaS products with minimal manual effort.  
## Goal 3  
Make Stripe configuration version-controlled.  
## Goal 4  
Provide safe deployment with preview and rollback.  
## Goal 5  
Allow migration between environments.  
  
---  
  
## Non-Goals  
Not a Stripe replacement.  
Not a payment processor.  
Not a subscription analytics platform.  
Not a customer management system.  
Not an invoicing platform.  
  
---  
  
## Core Concept  
User defines billing infrastructure in YAML.  
Example:  
```
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

      - name: Agency
        monthly_price: 299

```
CLI reads config and synchronises Stripe account.  
  
---  
  
## MVP Features  
## Account Registry  
Maintain registry of Stripe accounts.  
Store:  
* alias  
* account name  
* account id  
* environment  
* API key reference  
Example:  
```
accounts:
  leadfinder:
    account_id: acct_xxx

  estimator:
    account_id: acct_yyy

```
  
---  
  
## Product Synchronisation  
Create products.  
Update metadata.  
Create archives.  
Prevent accidental deletion.  
  
---  
  
## Price Synchronisation  
Create recurring prices.  
Create one-time prices.  
Support:  
* monthly  
* yearly  
* usage-based  
  
---  
  
## Customer Portal Configuration  
Configure:  
* business profile  
* support links  
* privacy policy URL  
* terms URL  
  
---  
  
## Checkout Defaults  
Generate configuration snippets.  
Validate product references.  
Validate price references.  
  
---  
  
## Webhook Provisioning  
Create webhooks.  
Configure endpoints.  
Generate secrets.  
Export environment variables.  
  
---  
  
## Plan Command  
Dry run.  
Example:  
```
billply plan

```
Output:  
```
+ Create product Pro

+ Create yearly plan

~ Update privacy policy URL

No destructive changes

```
  
---  
  
## Apply Command  
Execute plan.  
Example:  
```
billply apply

```
  
---  
  
## Verify Command  
Compare Stripe account to config.  
Identify drift.  
Example:  
```
billply verify

```
  
---  
  
## Export Command  
Generate runtime configuration.  
Example:  
```
billply export

```
Output:  
```
STRIPE_PRO_MONTHLY=price_xxx
STRIPE_PRO_YEARLY=price_yyy

```
  
---  
  
## Security Requirements  
No API keys stored in repository.  
Support:  
* environment variables  
* AWS Secrets Manager  
* 1Password  
* Doppler  
All secrets encrypted at rest.  
  
---  
  
## Technical Requirements  
## Language  
TypeScript  
## Runtime  
Node.js  
## Package Manager  
pnpm  
## Distribution  
npm package  
Example:  
```
npm install -g billply

```
  
---  
  
## Architecture  
CLI Layer  
↓  
Configuration Parser  
↓  
State Engine  
↓  
Stripe Adapter  
↓  
Stripe API  
  
---  
  
## Future Features  
## Multi-Account Deployment  
Deploy same billing structure to:  
* SaaS A  
* SaaS B  
* SaaS C  
using one command.  
  
---  
  
## SaaS Templates  
```
billply template apply saas-standard

```
Creates:  
* Starter  
* Pro  
* Enterprise  
plans automatically.  
  
---  
  
## GitHub Integration  
Run verification on pull requests.  
Prevent drift.  
  
---  
  
## CI/CD Support  
```
billply apply --production

```
during deployment pipeline.  
  
---  
  
## Terraform Provider  
Allow integration with Terraform.  
  
---  
  
## Success Metrics  
Time to configure new Stripe account:  
Current:30-60 minutes  
Target:Under 5 minutes  
Stripe dashboard actions required:  
Current:20-50  
Target:Less than 3  
Configuration reproducibility:  
Target:100%  
Drift detection:  
Target:100%  
A feature I'd add that isn't in most infrastructure tools: **account cloning**.  
Example:  
```
billply clone \
  --source leadfinder \
  --target estimator

```
It would inspect the source Stripe account and generate the YAML automatically. That's the sort of thing a founder with seven SaaS products would use immediately, and it's where the product starts feeling like a real SaaS-portfolio operating system rather than just a Stripe wrapper.  
