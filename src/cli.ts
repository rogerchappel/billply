#!/usr/bin/env node
import { Command } from 'commander';
import {
  ConfigError,
  buildPlan,
  exportRuntimeEnv,
  loadConfig,
  renderPlan,
  verifyConfig
} from './index.js';
import {
  hasStripeChanges,
  renderStripeSyncResult,
  syncStripeConfig
} from './stripe-adapter.js';
import { createStripeBillingClient } from './stripe-client.js';

type ConfigCommandOptions = {
  config: string;
};

type StripeCommandOptions = ConfigCommandOptions & {
  live?: boolean;
  stripe?: boolean;
};

type ApplyCommandOptions = ConfigCommandOptions & {
  execute?: boolean;
  live?: boolean;
};

type ExportCommandOptions = ConfigCommandOptions & {
  format: 'env' | 'json';
};

const program = new Command();

program
  .name('billply')
  .description('Infrastructure-as-code CLI for Stripe SaaS billing.')
  .version('0.1.0');

program
  .command('plan')
  .description('Preview the non-destructive Stripe resources described by config.')
  .option('-c, --config <path>', 'Path to billply YAML config.', 'billply.yaml')
  .option('--stripe', 'Compare config against Stripe using account api_key_env values.')
  .option('--live', 'Allow live Stripe keys. Omit this flag for sandbox/test-mode only.')
  .action(async (options: StripeCommandOptions) => {
    await run(async () => {
      const config = await loadConfig(options.config);

      if (options.stripe) {
        const result = await syncStripeConfig(config, createStripeBillingClient, {
          allowLive: Boolean(options.live)
        });
        console.log(renderStripeSyncResult(result));
        return;
      }

      console.log(renderPlan(buildPlan(config)));
    });
  });

program
  .command('verify')
  .description('Validate config and report local reference issues.')
  .option('-c, --config <path>', 'Path to billply YAML config.', 'billply.yaml')
  .option('--stripe', 'Verify config against Stripe using account api_key_env values.')
  .option('--live', 'Allow live Stripe keys. Omit this flag for sandbox/test-mode only.')
  .action(async (options: StripeCommandOptions) => {
    await run(async () => {
      const config = await loadConfig(options.config);

      if (options.stripe) {
        const result = await syncStripeConfig(config, createStripeBillingClient, {
          allowLive: Boolean(options.live)
        });

        console.log(renderStripeSyncResult(result));

        if (hasStripeChanges(result)) {
          process.exitCode = 1;
        }

        return;
      }

      const warnings = verifyConfig(config);

      if (warnings.length === 0) {
        console.log('Config valid');
        return;
      }

      console.log('Config valid with warnings:');
      for (const warning of warnings) {
        console.log(`- ${warning}`);
      }
    });
  });

program
  .command('export')
  .description('Export deterministic runtime names derived from config.')
  .option('-c, --config <path>', 'Path to billply YAML config.', 'billply.yaml')
  .option('--format <env|json>', 'Output format.', 'env')
  .action(async (options: ExportCommandOptions) => {
    await run(async () => {
      const config = await loadConfig(options.config);

      if (options.format === 'json') {
        const env = Object.fromEntries(
          exportRuntimeEnv(config)
            .trim()
            .split('\n')
            .filter(Boolean)
            .map((line) => line.split('=', 2))
        );

        console.log(JSON.stringify(env, null, 2));
        return;
      }

      if (options.format !== 'env') {
        throw new ConfigError(['export --format must be "env" or "json".']);
      }

      process.stdout.write(exportRuntimeEnv(config));
    });
  });

program
  .command('apply')
  .description('Apply supported Stripe setup changes. Defaults to a dry run.')
  .option('-c, --config <path>', 'Path to billply YAML config.', 'billply.yaml')
  .option('--execute', 'Write changes to Stripe. Without this flag, apply only prints a dry run.')
  .option('--live', 'Allow live Stripe keys. Omit this flag for sandbox/test-mode only.')
  .action(async (options: ApplyCommandOptions) => {
    await run(async () => {
      const config = await loadConfig(options.config);
      const result = await syncStripeConfig(config, createStripeBillingClient, {
        allowLive: Boolean(options.live),
        execute: Boolean(options.execute)
      });

      console.log(renderStripeSyncResult(result));

      if (!options.execute && hasStripeChanges(result)) {
        process.exitCode = 2;
      }
    });
  });

await program.parseAsync(process.argv);

async function run(operation: () => Promise<void>): Promise<void> {
  try {
    await operation();
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(error.message);
      process.exitCode = 1;
      return;
    }

    throw error;
  }
}
