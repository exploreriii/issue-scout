import { useEffect, useState } from "react";

export const STATUS_INTERVAL_MS = 1200;

/** The messages shown while a shortlist loads; the organisation count follows the filter. */
export function loadingMessages(orgCount: number): string[] {
  return [
    "Reading your GitHub profile",
    `Scanning ${orgCount} organisation${orgCount === 1 ? "" : "s"}`,
    "Ranking issues",
  ];
}

interface Props {
  messages: string[];
  intervalMs?: number;
}

/** One quiet line that steps through `messages` and rests on the last one until it is unmounted. */
export function StatusLine({ messages, intervalMs = STATUS_INTERVAL_MS }: Props) {
  const [i, setI] = useState(0);
  useEffect(() => {
    setI(0);
    const id = setInterval(() => setI((n) => Math.min(n + 1, messages.length - 1)), intervalMs);
    return () => clearInterval(id);
  }, [messages.length, intervalMs]);
  return (
    <p role="status" className="text-sm text-muted">
      {messages[i]}…
    </p>
  );
}
