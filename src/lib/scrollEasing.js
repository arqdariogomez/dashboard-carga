export function lerp(from, to, t) {
  return from + (to - from) * t;
}

// cubic-bezier(0.16, 1, 0.3, 1) approximation using a standard easing curve
// Use a simple easeInOut curve that feels similar to Apple's transitions.
export function easeInOutCubicBezier(t) {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
