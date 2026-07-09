import Script from "next/script";

/**
 * Next.js 16 dev instrumentation calls performance.measure() for Server
 * Components (e.g. AuthenticatedLayout). When HMR / tab throttling reorders
 * marks, the browser throws:
 *   TypeError: ... cannot have a negative time stamp
 * Framework bug (vercel/next.js#86060) — not app logic.
 *
 * Runs beforeInteractive in development only.
 */
export function DevPerformancePatch() {
  if (process.env.NODE_ENV !== "development") {
    return null;
  }

  return (
    <Script id="dev-performance-patch" strategy="beforeInteractive">{`
(function () {
  if (typeof performance === "undefined" || !performance.measure) return;
  var original = performance.measure.bind(performance);
  performance.measure = function () {
    try {
      return original.apply(performance, arguments);
    } catch (err) {
      if (err && err.name === "TypeError" && /negative time stamp/i.test(String(err.message || ""))) {
        return undefined;
      }
      throw err;
    }
  };
})();
`}</Script>
  );
}
