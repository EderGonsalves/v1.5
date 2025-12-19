import "@testing-library/jest-dom";

class ResizeObserverPolyfill {
  observe() {}
  unobserve() {}
  disconnect() {}
}

type GlobalWithObserver = typeof globalThis & {
  ResizeObserver?: typeof ResizeObserverPolyfill;
};

const globalTarget = globalThis as GlobalWithObserver;

if (!globalTarget.ResizeObserver) {
  globalTarget.ResizeObserver = ResizeObserverPolyfill;
}
