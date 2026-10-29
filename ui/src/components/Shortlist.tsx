import type { Ranked, ShortlistItem } from "../api";
import { IssueCard } from "./IssueCard";

interface Props {
  shortlist: ShortlistItem[];
  runnersUp: Ranked[];
  /** Explanations are still on their way (the cards are already final). */
  explaining?: boolean;
}

export function Shortlist({ shortlist, runnersUp, explaining = false }: Props) {
  if (shortlist.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line-strong p-8 text-center">
        <p className="font-serif text-lg">No open issues matched. Try fewer constraints.</p>
      </div>
    );
  }
  const hasExplanations = shortlist.some((s) => s.explanation);
  return (
    <section aria-labelledby="shortlist-heading" className="space-y-5">
      <h2 id="shortlist-heading" className="font-serif text-2xl">
        Your shortlist
      </h2>
      {!hasExplanations && !explaining && (
        <p className="rounded-md border border-line bg-inset px-4 py-3 text-sm text-muted">
          Explanations are unavailable right now; the ranking is unaffected.
        </p>
      )}
      <ol className="space-y-4 list-none p-0">
        {shortlist.map((item) => (
          <li key={item.issue.id}>
            <IssueCard item={item} explaining={explaining} />
          </li>
        ))}
      </ol>
      {runnersUp.length > 0 && (
        <details className="rounded-lg border border-line bg-surface px-4 py-3">
          <summary className="cursor-pointer">
            <span className="font-semibold">Five more, and why they ranked lower</span>
          </summary>
          <ul className="mt-4 space-y-4 list-none p-0">
            {runnersUp.map((r) => (
              <li key={r.issue.id}>
                <p className="text-xs font-medium tracking-wide text-muted">
                  {r.issue.org}/{r.issue.repo}
                </p>
                <a
                  href={r.issue.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="font-serif underline decoration-line-strong underline-offset-4 hover:decoration-fg"
                >
                  {r.issue.title}
                </a>
                <ul className="mt-1 list-disc pl-5 text-sm text-muted" aria-label="Reasons">
                  {r.reasons.map((reason, i) => (
                    <li key={i}>{reason}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
