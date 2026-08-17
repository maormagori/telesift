interface CancellableSleep {
  promise: Promise<void>;
  cancel: () => void;
}

function sleep(ms: number): CancellableSleep {
  let resolveFn: () => void = () => {};
  const promise = new Promise<void>((resolve) => {
    resolveFn = resolve;
  });
  const timeoutHandle = setTimeout(resolveFn, ms);
  return { promise, cancel: () => (clearTimeout(timeoutHandle), resolveFn()) };
}

export interface CancellableWait {
  wait(ms: number): Promise<void>;
  cancel(): void;
}

export function createCancellableWait(): CancellableWait {
  let current: CancellableSleep | null = null;

  async function wait(ms: number): Promise<void> {
    const delay = sleep(ms);
    current = delay;
    await delay.promise;
    current = null;
  }

  function cancel(): void {
    current?.cancel();
  }

  return { wait, cancel };
}
