import type { OrgInfo } from "../api";

interface Props {
  orgs: OrgInfo[];
  /** Logins currently included. */
  selected: ReadonlySet<string>;
  /** Candidates per org before the org filter; absent until a shortlist exists. */
  counts?: Record<string, number> | undefined;
  onToggle: (login: string) => void;
}

/** The chat command that applies a selection (parsed deterministically by the worker, no model call). */
export function orgCommand(orgs: OrgInfo[], selected: ReadonlySet<string>): string {
  const chosen = orgs.filter((o) => selected.has(o.login)).map((o) => o.login);
  return chosen.length === orgs.length ? "all orgs" : `only orgs ${chosen.join(", ")}`;
}

export function OrgFilter({ orgs, selected, counts, onToggle }: Props) {
  if (orgs.length === 0) return null;
  return (
    <div role="group" aria-label="Filter by organisation" className="flex flex-wrap items-center gap-2">
      {orgs.map((o) => {
        const pressed = selected.has(o.login);
        const count = counts?.[o.login];
        const empty = count === 0;
        const suffix = count === undefined ? "" : empty ? " · 0 open" : ` · ${count}`;
        const tone = pressed
          ? "border-accent bg-accent text-white hover:brightness-110"
          : "border-line-strong bg-surface text-fg hover:bg-inset";
        return (
          <button
            key={o.login}
            type="button"
            aria-pressed={pressed}
            onClick={() => onToggle(o.login)}
            className={`rounded-full border px-3 py-1 text-sm font-medium ${tone} ${empty ? "opacity-60" : ""}`}
          >
            {o.displayName}
            {suffix}
          </button>
        );
      })}
    </div>
  );
}
