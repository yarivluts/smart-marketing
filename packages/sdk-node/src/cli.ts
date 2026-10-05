#!/usr/bin/env node
import { GrowthOS } from './client.js';
import { formatVerification } from './verify-format.js';

/**
 * `npx @growthos/node verify` - checks an installation from a terminal or CI:
 *
 *   growthos verify --expect touchpoint,signup,customer [--key gos_live_...] [--base-url ...] [--json]
 *
 * The key defaults to GROWTHOS_API_KEY. Exit code 0 when every expected schema is receiving with
 * nothing in quarantine, 1 when something needs attention, 2 when the check itself failed.
 */

function argValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(`--${name}`);
  if (index >= 0) return args[index + 1];
  const inline = args.find((arg) => arg.startsWith(`--${name}=`));
  return inline?.slice(name.length + 3);
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const [command, ...args] = argv;
  if (command !== 'verify') {
    console.log(
      'Usage: growthos verify [--expect a,b,c] [--key <key>] [--base-url <url>] [--json]',
    );
    return command === undefined || command === '--help' || command === 'help' ? 0 : 2;
  }
  const apiKey = argValue(args, 'key') ?? process.env.GROWTHOS_API_KEY;
  if (!apiKey) {
    console.error('growthos verify: pass --key or set GROWTHOS_API_KEY.');
    return 2;
  }
  const expect = (argValue(args, 'expect') ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
  try {
    const client = new GrowthOS({ apiKey, baseUrl: argValue(args, 'base-url'), maxRetries: 2 });
    const result = await client.verify({ expect });
    console.log(
      args.includes('--json') ? JSON.stringify(result, null, 2) : formatVerification(result),
    );
    return result.report.status === 'ok' ? 0 : 1;
  } catch (error) {
    console.error(`growthos verify: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
}

if (require.main === module) {
  void main().then((code) => process.exit(code));
}
