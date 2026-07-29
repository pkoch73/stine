import assert from 'node:assert/strict';
import { getBranchRedirectUrl } from '../scripts/branch-redirect.js';

const loc = (hostname, pathname, search = '', hash = '', protocol = 'https:') => ({
  hostname, pathname, search, hash, protocol,
});

const cases = [
  ['canonical page', loc('main--sendto--aemcoder.aem.page', '/1234/'),
    'https://1234--sendto--aemcoder.aem.page/1234/'],
  ['live + query + hash', loc('main--sendto--aemcoder.aem.live', '/1234/x', '?q=1', '#h'),
    'https://1234--sendto--aemcoder.aem.live/1234/x?q=1#h'],
  ['root path', loc('main--sendto--aemcoder.aem.page', '/'), null],
  ['already main path', loc('main--sendto--aemcoder.aem.page', '/main/foo'), null],
  ['target host (no loop)', loc('1234--sendto--aemcoder.aem.page', '/1234/'), null],
  ['non-main source', loc('5678--sendto--aemcoder.aem.page', '/1234/'), null],
  ['localhost dev', loc('localhost', '/1234/'), null],
  ['non-dns segment', loc('main--sendto--aemcoder.aem.page', '/Hello%20World/'), null],
  ['router word path', loc('main--sendto--aemcoder.aem.page', '/products/'),
    'https://products--sendto--aemcoder.aem.page/products/'],
  ['da.live preview', loc('main--sendto--aemcoder.preview.da.live', '/1234/'),
    'https://1234--sendto--aemcoder.preview.da.live/1234/'],
  ['da.live preview (no loop)', loc('1234--sendto--aemcoder.preview.da.live', '/1234/'), null],
  ['da.live content host excluded', loc('content.da.live', '/aemcoder/sendto/1234'), null],
  ['reserved status segment', loc('main--sendto--aemcoder.aem.page', '/status/abc123'), null],
];

let failures = 0;
for (const [name, input, expected] of cases) {
  try {
    assert.equal(getBranchRedirectUrl(input), expected);
    process.stdout.write(`PASS  ${name}\n`);
  } catch (err) {
    failures += 1;
    process.stdout.write(`FAIL  ${name}: ${err.message}\n`);
  }
}
process.stdout.write(failures ? `\n${failures} FAILED\n` : '\nALL PASS\n');
process.exit(failures ? 1 : 0);
