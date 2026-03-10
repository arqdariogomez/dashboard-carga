import assert from 'node:assert/strict';
import { easeInOutCubicBezier, lerp } from '../src/lib/scrollEasing.js';

const approx = (a, b, eps = 1e-3) => Math.abs(a - b) < eps;

// lerp basics
assert.equal(lerp(0, 10, 0), 0);
assert.equal(lerp(0, 10, 1), 10);
assert.ok(approx(lerp(0, 10, 0.5), 5));

// easing monotonic + endpoints
assert.ok(approx(easeInOutCubicBezier(0), 0));
assert.ok(approx(easeInOutCubicBezier(1), 1));
assert.ok(easeInOutCubicBezier(0.2) < easeInOutCubicBezier(0.8));

console.log('OK');
