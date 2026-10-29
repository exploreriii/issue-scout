import { useState, type FormEvent } from "react";
import type { useScoutChat } from "../agent";
import type { ScoutInput } from "../api";

const URL_RE = /(https?:\/\/[^\s)]+)/g;

/** Plain text with any URL made a link (new tab). Chat text is data, so nothing is rendered as HTML. */
function linkify(text: string) {
  return text.split(URL_RE).map((part, i) =>
    i % 2 === 1 ? (
      <a key={i} href={part} target="_blank" rel="noreferrer noopener" className="underline underline-offset-4">
        {part}
      </a>
    ) : (
      part
    ),
  );
}

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
          <p className="whitespace-pre-line">
            <span className="text-muted">Scout: </span>
            {linkify(lastAssistant.text)}
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
          placeholder="e.g. I want to find a Rust issue in a new repository that fits my skills"
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
