import { useState, type FormEvent } from "react";
import type { useScoutChat } from "../agent";
import type { ScoutInput } from "../api";

interface Props {
  /** The chat is disabled until a shortlist exists. */
  hasShortlist: boolean;
  /** The connection, owned by App so the org filter can use it too. */
  chat: ReturnType<typeof useScoutChat>;
  /** The input behind the shortlist on screen; lets a fresh session refine it. */
  seed?: ScoutInput | null;
}

export function ChatStrip({ hasShortlist, chat, seed }: Props) {
  const { messages, send, pending, connected } = chat;
  const [text, setText] = useState("");
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const enabled = hasShortlist && connected && !pending;

  function submit(e: FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t || !enabled) return;
    send(t, seed ?? undefined);
    setText("");
  }

  return (
    <section
      aria-label="Refine the shortlist"
      className="space-y-2 border-t border-line bg-bg/95 py-3 backdrop-blur md:sticky md:bottom-0"
    >
      <div aria-live="polite" className="text-sm">
        {pending ? (
          <p role="status" className="text-muted">
            Thinking…
          </p>
        ) : lastAssistant ? (
          <p>
            <span className="text-muted">Scout: </span>
            {lastAssistant.text}
          </p>
        ) : null}
      </div>
      <form onSubmit={submit} className="flex gap-2">
        <label htmlFor="chat-input" className="sr-only">
          Refine the shortlist
        </label>
        <input
          id="chat-input"
          type="text"
          value={text}
          disabled={!hasShortlist}
          onChange={(e) => setText(e.target.value)}
          autoComplete="off"
          placeholder="Refine, e.g. only Rust, or nothing bigger than an evening"
          className="min-w-0 flex-1 rounded-md border border-line-strong bg-surface px-3 py-2 text-base text-fg disabled:cursor-not-allowed disabled:bg-inset"
        />
        <button
          type="submit"
          disabled={!enabled}
          className="rounded-md bg-accent px-4 py-2 font-medium text-white hover:brightness-110 disabled:cursor-not-allowed disabled:bg-line disabled:text-muted disabled:hover:brightness-100"
        >
          Refine
        </button>
      </form>
      {hasShortlist && !connected && <p className="text-xs text-muted">Connecting to the assistant…</p>}
    </section>
  );
}
