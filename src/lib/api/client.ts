import type { SyncReply, SyncRequest, SyncTransport } from '../sync/syncEngine'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    credentials: 'same-origin',
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  })

  if (!response.ok) {
    const detail = await response.json().catch(() => ({}) as { error?: string })
    throw new ApiError(response.status, detail.error ?? `falha na requisição (${response.status})`)
  }
  return response.json() as Promise<T>
}

const post = <T>(path: string, body: unknown) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body) })

export interface SessionInfo {
  deviceId: string
  deviceName: string
}

export const api = {
  me: () => request<SessionInfo>('me'),

  login: (password: string, deviceName: string) =>
    post<SessionInfo>('login', { password, deviceName }),

  logout: () => request<{ ok: true }>('me', { method: 'DELETE' }),

  createPairingCode: () =>
    post<{ code: string; expiresAt: string }>('pair', { action: 'create' }),

  redeemPairingCode: (code: string, deviceName: string) =>
    post<SessionInfo>('pair', { action: 'redeem', code, deviceName }),
}

export const httpSyncTransport: SyncTransport = {
  sync: (payload: SyncRequest) => post<SyncReply>('sync', payload),
}
