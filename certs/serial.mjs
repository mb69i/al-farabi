// Guards for the certificate function (api/certificate.mjs) when one server copy gets several requests at once.
// Load test 20 Nov: parallel drawings in one copy raced to unpack Chromium ("spawn ETXTBSY") and crashed each
// other's single-process browser.

/** Wraps an async function so calls run one after another, in order; a failed call never blocks the next. */
export function oneAtATime(fn) {
  let tail = Promise.resolve();
  return (...args) => {
    const run = tail.then(() => fn(...args));
    tail = run.catch(() => {});
    return run;
  };
}

/** Runs an async function once and shares the result with every caller; if it fails, the next call tries again. */
export function once(fn) {
  let pending = null;
  return () => {
    if (!pending) {
      pending = fn().catch((e) => {
        pending = null;
        throw e;
      });
    }
    return pending;
  };
}
