import test from 'node:test';
import assert from 'node:assert/strict';
import {qrSvg,groupKey} from '../platform/client/qr.mjs';

test('authenticator QR code is a self-contained dark-on-white SVG with a quiet zone', () => {
  const svg = qrSvg('otpauth://totp/Crate%20Ship%20Games%3Aowner%40example.test?secret=ABCDEFGHIJKLMNOPQRSTUVWXYZ234567&issuer=Crate%20Ship%20Games');
  const total = Number(/viewBox="0 0 (\d+)/.exec(svg)[1]);
  assert.ok(total >= 21 + 8);
  assert.match(svg, /<rect width="\d+" height="\d+" fill="#fff"\/>/);
  const cells = [...svg.matchAll(/M(\d+) (\d+)h1v1h-1z/g)].map(m => [+m[1], +m[2]]);
  assert.ok(cells.length > 100);
  assert.ok(cells.every(([x, y]) => x >= 4 && y >= 4 && x < total - 4 && y < total - 4));
  assert.doesNotMatch(qrSvg('x', { label: '<script>' }), /<script>/);
});
test('setup keys are grouped in fours for typing', () => {
  assert.equal(groupKey('ABCDEFGHIJ'), 'ABCD EFGH IJ');
});
