import assert from 'node:assert/strict';
import { isDaCanvasUrl, welcomeUrl } from '../scripts/status-target.js';

let failures = 0;
const check = (name, actual, expected) => {
  try {
    assert.equal(actual, expected);
    process.stdout.write(`PASS  ${name}\n`);
  } catch (err) {
    failures += 1;
    process.stdout.write(`FAIL  ${name}: ${err.message}\n`);
  }
};

// welcomeUrl: replace the last path segment with 'welcome'
check('index -> welcome',
  welcomeUrl('https://da.live/canvas#/aemcoder/sendto/df92ef3c/index'),
  'https://da.live/canvas#/aemcoder/sendto/df92ef3c/welcome');
check('trailing slash tolerated',
  welcomeUrl('https://da.live/canvas#/aemcoder/sendto/df92ef3c/index/'),
  'https://da.live/canvas#/aemcoder/sendto/df92ef3c/welcome');
check('per-user repo host preserved',
  welcomeUrl('https://da.live/canvas#/aemcoder/ca3fa77e6c1f/1c7514b6d325/index'),
  'https://da.live/canvas#/aemcoder/ca3fa77e6c1f/1c7514b6d325/welcome');
check('non-index last segment swapped',
  welcomeUrl('https://da.live/canvas#/aemcoder/sendto/df92ef3c/foo'),
  'https://da.live/canvas#/aemcoder/sendto/df92ef3c/welcome');

// isDaCanvasUrl: da.live/canvas host AND >= 4 path segments after '#/'
check('accepts full canvas url',
  isDaCanvasUrl('https://da.live/canvas#/aemcoder/sendto/df92ef3c/index'), true);
check('accepts per-user canvas url',
  isDaCanvasUrl('https://da.live/canvas#/aemcoder/ca3fa77e6c1f/1c7514b6d325/index'), true);
check('rejects http scheme',
  isDaCanvasUrl('http://da.live/canvas#/aemcoder/sendto/df92ef3c/index'), false);
check('rejects other host',
  isDaCanvasUrl('https://evil.example/canvas#/aemcoder/sendto/df92ef3c/index'), false);
check('rejects bare prefix',
  isDaCanvasUrl('https://da.live/canvas#/'), false);
check('rejects too few segments',
  isDaCanvasUrl('https://da.live/canvas#/aemcoder/sendto/df92ef3c'), false);
check('rejects null', isDaCanvasUrl(null), false);
check('rejects non-string', isDaCanvasUrl(123), false);

process.stdout.write(failures ? `\n${failures} FAILED\n` : '\nALL PASS\n');
process.exit(failures ? 1 : 0);
