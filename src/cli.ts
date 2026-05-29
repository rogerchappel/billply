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

type ConfigCommandOptions = {
  config: string;
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
  .action(async (options: ConfigCommandOptions) => {
    await run(async () => {
      const config = await loadConfig(options.config);
      console.log(renderPlan(buildPlan(config)));
    });
  });

program
  .command('verify')
  .description('Validate config and report local reference issues.')
  .option('-c, --config <path>', 'Path to billply YAML config.', 'billply.yaml')
  .action(async (options: ConfigCommandOptions) => {
    await run(async () => {
      const config = await loadConfig(options.config);
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
  .description('Reserved for the future Stripe adapter.')
  .action(() => {
    console.error('billply apply is intentionally disabled in this MVP. Run billply plan first; no Stripe API mutations are implemented yet.');
    process.exitCode = 2;
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
