/**
 * HTTP client for the Remote Game Server (see src/server and
 * docs/INTEGRATION.md). Requests that may have reached the server are
 * retried with the same requestId, which the server treats as idempotent,
 * so a flaky connection can never stake twice or lose a round.
 */
import { GameError, type ErrorCode, type GameService, type PlayRequest, type PlayResult, type RoundRecord, type SessionInfo } from '../../rgs/types';

export class NetworkError extends Error {}

export class RemoteService implements GameService {
  private sessionId = '';

  constructor(
    private readonly baseUrl: string,
    private readonly credentials: { playerId?: string; token?: string },
  ) {}

  private async call<T>(method: 'GET' | 'POST', path: string, body?: unknown, retries = 0): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await fetch(this.baseUrl + path, {
          method,
          headers: body ? { 'content-type': 'application/json' } : undefined,
          body: body ? JSON.stringify(body) : undefined,
        });
      } catch {
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
          continue;
        }
        throw new NetworkError('network');
      }
      const data = (await res.json().catch(() => ({}))) as { error?: ErrorCode; message?: string };
      if (res.ok) return data as T;
      if (res.status >= 500 && res.status !== 503 && attempt < retries) {
        await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
        continue;
      }
      throw new GameError(data.error ?? 'INTERNAL', data.message);
    }
  }

  async open(): Promise<SessionInfo> {
    const info = await this.call<SessionInfo>('POST', '/api/session/open', this.credentials, 2);
    this.sessionId = info.sessionId;
    return info;
  }

  play(req: Omit<PlayRequest, 'sessionId'>): Promise<PlayResult> {
    return this.call<PlayResult>('POST', '/api/round/play', { ...req, sessionId: this.sessionId }, 3);
  }

  async ack(roundId: string): Promise<void> {
    await this.call('POST', '/api/round/ack', { sessionId: this.sessionId, roundId }, 2);
  }

  async history(limit: number): Promise<RoundRecord[]> {
    const q = `sessionId=${encodeURIComponent(this.sessionId)}&limit=${limit}`;
    return (await this.call<{ rounds: RoundRecord[] }>('GET', `/api/history?${q}`, undefined, 1)).rounds;
  }
}
