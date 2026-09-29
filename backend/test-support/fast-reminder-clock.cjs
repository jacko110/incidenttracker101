// Only loaded by the isolated process test. Verify the production interval,
// then accelerate it so the test does not need to wait an hour.
const originalSetInterval = global.setInterval;
global.setInterval = (callback, milliseconds, ...args) => {
  if (milliseconds !== 60 * 60 * 1000) throw new Error('Unexpected reminder interval');
  process.send?.({ interval: milliseconds });
  return originalSetInterval(() => {
    callback(...args);
    process.send?.({ tick: true });
  }, 100);
};
