let override: (() => number) | null = null;

export function now(): number {
  return override ? override() : Date.now();
}

export function setNow(fn: (() => number) | null): void {
  override = fn;
}
