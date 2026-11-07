// Bundles the command-line tool and agent server into one file that runs on Node.js 20 or newer.
import { build } from 'esbuild';
import { readFileSync, chmodSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

// The PDF reader's worker is carried inside the bundle as a data address.
const inlineUrl = {
  name: 'inline-url',
  setup(b) {
    b.onResolve({ filter: /\?url$/ }, (a) => ({ path: require.resolve(a.path.replace(/\?url$/, ''), { paths: [a.resolveDir] }), namespace: 'inline-url' }));
    b.onLoad({ filter: /.*/, namespace: 'inline-url' }, (a) => ({ contents: `export default ${JSON.stringify(`data:text/javascript;base64,${readFileSync(a.path).toString('base64')}`)};`, loader: 'js' }));
  },
};

const [entry = 'src/cli/index.ts', outfile = 'dist-cli/clerdodraft.mjs'] = process.argv.slice(2);

await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  minify: !process.env.CLI_DEBUG,
  sourcemap: process.env.CLI_DEBUG ? 'inline' : false,
  legalComments: 'linked',
  banner: { js: "#!/usr/bin/env node\nimport { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  define: { __VERSION__: JSON.stringify(pkg.version), 'import.meta.env.VITE_RELEASE_REPO': '"clerdoapp/clerdodraft"' },
  loader: { '.dic': 'text', '.aff': 'text', '.txt': 'text', '.css': 'empty', '.woff2': 'empty', '.woff': 'empty' },
  plugins: [inlineUrl],
  logLevel: 'warning',
});
chmodSync(outfile, 0o755);
console.log(`Built ${outfile}`);
