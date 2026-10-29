import type { FetchLike } from "../src/index.js";

export interface RecordedCall {
  url: string;
  init: RequestInit;
  headers: Record<string, string>;
  body?: any;
}

/** Fetch mock: `respond` returns a Response (or a JSON body) per call. Never touches the network. */
export function mockFetch(respond: (call: RecordedCall, n: number) => Response | unknown) {
  const calls: RecordedCall[] = [];
  const fetch: FetchLike = async (url, init = {}) => {
    const call: RecordedCall = {
      url,
      init,
      headers: (init.headers ?? {}) as Record<string, string>,
      body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);
    const r = respond(call, calls.length);
    return r instanceof Response ? r : jsonResponse(r);
  };
  return { fetch, calls };
}

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    ...init,
    headers: { "content-type": "application/json", ...(init.headers as Record<string, string> | undefined) },
  });
}
