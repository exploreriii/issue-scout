import { useCallback, useRef, useState } from "react";
import { useAgent } from "agents/react";
import type { Ranked, ScoutInput, ShortlistItem } from "./api";

/** What an assistant frame can carry besides the list itself. */
export interface ShortlistMeta {
  runnersUp?: Ranked[];
  orgCounts?: Record<string, number>;
  orgs?: string[];
}

export type ChatMessage = { role: "user" | "assistant"; text: string };

const KEY = "issue-scout-session";

/** One session id per browser tab, kept in sessionStorage (no cookies). */
export function getSessionId(): string {
  try {
    const existing = sessionStorage.getItem(KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    sessionStorage.setItem(KEY, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

/**
 * Thin wrapper over the Agents SDK hook. Connects to
 * /agents/issue-scout/{sessionId}; sends {type:"user", text};
 * receives {type:"assistant", text, shortlist?}.
 */
export function useScoutChat(onShortlist: (s: ShortlistItem[], meta: ShortlistMeta) => void) {
  const sessionId = useRef(getSessionId()).current;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [connected, setConnected] = useState(false);

  const agent = useAgent({
    agent: "issue-scout",
    name: sessionId,
    onOpen: () => setConnected(true),
    onClose: () => setConnected(false),
    onMessage: (event: MessageEvent) => {
      let data: unknown;
      try {
        data = JSON.parse(String(event.data));
      } catch {
        return;
      }
      const m = data as { type?: string; text?: string; shortlist?: ShortlistItem[] } & ShortlistMeta;
      if (m.type !== "assistant" || typeof m.text !== "string") return;
      setMessages((prev) => [...prev, { role: "assistant", text: m.text as string }]);
      setPending(false);
      if (Array.isArray(m.shortlist)) {
        onShortlist(m.shortlist, {
          ...(Array.isArray(m.runnersUp) ? { runnersUp: m.runnersUp } : {}),
          ...(m.orgCounts && typeof m.orgCounts === "object" ? { orgCounts: m.orgCounts } : {}),
          ...(Array.isArray(m.orgs) ? { orgs: m.orgs } : {}),
        });
      }
    },
  });

  const send = useCallback(
    (text: string, seed?: ScoutInput) => {
      setMessages((prev) => [...prev, { role: "user", text }]);
      setPending(true);
      // `seed` is the input behind the shortlist on screen, so a session that has never seen it can still refine.
      agent.send(JSON.stringify({ type: "user", text, ...(seed ? { seed } : {}) }));
    },
    [agent],
  );

  return { messages, send, pending, connected, sessionId };
}
