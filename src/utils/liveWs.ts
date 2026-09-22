/**
 * Resolve the Live voice WebSocket URL.
 *
 * Firebase Hosting rewrites /api/** to Cloud Run reliably, but WebSocket
 * upgrades on /ws/** currently fall through as HTML 200. In production we
 * connect straight to the Cloud Run service (same project).
 */
export function liveWebSocketUrl(topic: string, grade: string): string {
  const params = `topic=${encodeURIComponent(topic)}&grade=${encodeURIComponent(grade)}`;
  const explicit = (import.meta as any).env?.VITE_LIVE_WS_BASE as string | undefined;

  let base = explicit?.replace(/\/$/, '');
  if (!base && typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host.endsWith('.web.app') || host.endsWith('.firebaseapp.com')) {
      base = 'https://dr-marcus-live-45388528859.us-central1.run.app';
    }
  }

  if (base) {
    const wsBase = base.replace(/^http/, 'ws');
    return `${wsBase}/ws/live?${params}`;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws/live?${params}`;
}
