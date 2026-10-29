import type { Ranked, Explanation } from "../api";

interface Props {
  item: Ranked & { explanation?: Explanation };
  headingLevel?: 2 | 3;
  /** True while the explanations are still being written; a card without one shows a placeholder. */
  explaining?: boolean;
}

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="mt-[0.3em] size-3.5 shrink-0 text-bar"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 8.5l3.2 3.2L13 4.8" />
    </svg>
  );
}

/** The server sends raw rule points (typically 0 to 13), not a percentage. */
const MAX_SCORE = 13;

export function matchLabel(score: number): string {
  if (score >= 8) return "Strong match";
  if (score >= 5) return "Good match";
  return "Possible match";
}

export function IssueCard({ item, headingLevel = 3, explaining = false }: Props) {
  const { issue, score, reasons, explanation } = item;
  const label = matchLabel(score);
  const pct = Math.max(0, Math.min(100, (score / MAX_SCORE) * 100));
  const H = `h${headingLevel}` as "h2" | "h3";
  const barLabelId = `score-${issue.id}`;

  return (
    <article
      tabIndex={0}
      aria-labelledby={`title-${issue.id}`}
      className="card space-y-4 rounded-lg border border-line bg-surface p-5"
    >
      <div>
        <p className="text-xs font-medium tracking-wide text-muted">
          <a
            href={`https://github.com/${issue.org}/${issue.repo}`}
            target="_blank"
            rel="noreferrer noopener"
            className="underline decoration-line-strong underline-offset-4 hover:text-fg hover:decoration-fg"
          >
            {issue.org}/{issue.repo}
          </a>
          #{issue.number}
          {issue.repoLanguage ? ` · ${issue.repoLanguage}` : ""}
        </p>
        <H id={`title-${issue.id}`} className="mt-1 font-serif text-lg leading-snug">
          <a
            href={issue.url}
            target="_blank"
            rel="noreferrer noopener"
            className="underline decoration-line-strong underline-offset-4 hover:decoration-fg"
          >
            {issue.title}
          </a>
        </H>
      </div>

      {issue.labels.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Labels">
          {issue.labels.map((l) => (
            <li key={l} className="rounded-full bg-inset px-2.5 py-0.5 text-xs text-muted">
              {l}
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-1.5">
        <p id={barLabelId} className="text-sm font-medium">
          {label}
        </p>
        <div
          role="meter"
          aria-labelledby={barLabelId}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct)}
          aria-valuetext={label}
          className="h-1.5 overflow-hidden rounded-full bg-inset"
        >
          <div className="h-full rounded-full bg-bar" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {reasons.length > 0 && (
        <ul className="space-y-1 text-sm" aria-label="Why this ranked">
          {reasons.map((r, i) => (
            <li key={i} className="flex gap-2">
              <CheckIcon />
              <span>{r}</span>
            </li>
          ))}
        </ul>
      )}

      {explanation && (
        <dl className="space-y-3 rounded-md bg-inset p-4 text-sm">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Why it fits you</dt>
            <dd className="mt-0.5">{explanation.fit}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted">What a first PR looks like</dt>
            <dd className="mt-0.5">{explanation.firstPrLooksLike}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Effort</dt>
            <dd className="mt-0.5">About {explanation.effortHours} hours</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted">First step</dt>
            <dd className="mt-0.5">{explanation.firstStep}</dd>
          </div>
        </dl>
      )}
      {!explanation && explaining && (
        <div role="status" className="space-y-2 rounded-md bg-inset p-4 text-sm text-muted">
          <p>Writing a short explanation…</p>
          <div aria-hidden="true" className="shimmer h-2.5 w-4/5 rounded-full" />
          <div aria-hidden="true" className="shimmer h-2.5 w-3/5 rounded-full" />
        </div>
      )}
    </article>
  );
}
