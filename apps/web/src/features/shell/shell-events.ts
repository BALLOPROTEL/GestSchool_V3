export const shellContextRefreshEvent = 'gestschool:shell-context-refresh';

export function notifyShellContextRefresh(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(shellContextRefreshEvent));
}
