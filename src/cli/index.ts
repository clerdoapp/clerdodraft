import { main } from './main';

main(process.argv.slice(2)).then(
  (code) => { if (code >= 0) process.exitCode = code; },
  (e: unknown) => { process.stderr.write(`${e instanceof Error ? (process.env.CLI_DEBUG ? e.stack : e.message) : String(e)}\n`); process.exitCode = 1; },
);
