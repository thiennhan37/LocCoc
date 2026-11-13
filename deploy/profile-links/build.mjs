import { mkdir, copyFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
function option(name, fallback) {
  const at = args.indexOf(name);
  return at < 0 ? fallback : args[at + 1];
}
const hashes = option('--sha256', '').split(',').filter(Boolean).map(s => s.toUpperCase());
if (!hashes.length || hashes.some(s => !/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(s))) {
  throw new Error('Pass --sha256 with actual certificate SHA-256 fingerprints separated by commas.');
}
const team = option('--team-id', '');
if (team && !/^[A-Z0-9]{10}$/.test(team)) throw new Error('Invalid Apple Team ID');
const output = resolve(option('--output', '.codex-output/profile-links-site'));
const source = dirname(fileURLToPath(import.meta.url));
await mkdir(dirname(output), { recursive: true });
await mkdir(output); // Refuse an existing upload folder to avoid stale association files.
await mkdir(resolve(output, '.well-known'));
await copyFile(resolve(source, 'index.html'), resolve(output, 'index.html'));
await writeFile(resolve(output, '.well-known/assetlinks.json'), JSON.stringify([{
  relation: ['delegate_permission/common.handle_all_urls'],
  target: { namespace: 'android_app', package_name: 'com.example.mobile_app', sha256_cert_fingerprints: hashes },
}], null, 2));
if (team) {
  await writeFile(resolve(output, '.well-known/apple-app-site-association'), JSON.stringify({
    applinks: { apps: [], details: [{ appID: `${team}.com.example.mobileApp`, paths: ['NOT /.well-known/*', 'NOT /*/*', 'NOT /', '/*'] }] },
  }, null, 2));
}
await writeFile(resolve(output, '_headers'), `/.well-known/*
  Content-Type: application/json
  Cache-Control: public, max-age=300
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'
`);
console.log(`Upload the contents of ${output} to Cloudflare Pages.`);
if (!team) console.log('iOS association was not generated: supply the actual Apple Team ID to enable iOS links.');
