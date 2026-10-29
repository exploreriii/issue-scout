import { useEffect, useRef, useState } from "react";
import { getOrgs, postScout, type OrgInfo, type ScoutInput, type ShortlistItem, type Ranked } from "./api";
import { useScoutChat, type ShortlistMeta } from "./agent";
import { HandleForm } from "./components/HandleForm";
import { OrgFilter, orgCommand } from "./components/OrgFilter";
import { Shortlist } from "./components/Shortlist";
import { ChatStrip } from "./components/ChatStrip";
import { Spinner } from "./components/Spinner";

function Skeleton() {
  return (
    <div aria-hidden="true" className="space-y-4">
      {[0, 1, 2].map((i) => (
        <div key={i} className="skeleton h-40 rounded-lg bg-inset" />
      ))}
    </div>
  );
}

export function App() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shortlist, setShortlist] = useState<ShortlistItem[] | null>(null);
  const [runnersUp, setRunnersUp] = useState<Ranked[]>([]);
  const [orgs, setOrgs] = useState<OrgInfo[]>([]);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [orgCounts, setOrgCounts] = useState<Record<string, number> | undefined>();
  const lastInput = useRef<ScoutInput | null>(null);

  function onChatShortlist(s: ShortlistItem[], meta: ShortlistMeta) {
    setShortlist(s);
    setRunnersUp(meta.runnersUp ?? []);
    if (meta.orgCounts) setOrgCounts(meta.orgCounts);
  }
  const chat = useScoutChat(onChatShortlist);

  // All orgs on by default. Without /orgs the page simply has no filter row.
  useEffect(() => {
    let live = true;
    getOrgs()
      .then((list) => {
        if (!live) return;
        setOrgs(list);
        setSelected(new Set(list.map((o) => o.login)));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  /** Omit `orgs` from the request when everything is selected. */
  const orgsParam = (sel: ReadonlySet<string>) =>
    sel.size === orgs.length ? undefined : orgs.filter((o) => sel.has(o.login)).map((o) => o.login);

  function toggleOrg(login: string) {
    const next = new Set(selected);
    if (next.has(login)) next.delete(login);
    else next.add(login);
    if (next.size === 0) return; // at least one org stays on
    setSelected(next);
    if (!shortlist || loading) return; // no shortlist yet: only sets the selection for the next "Find issues"
    if (chat.connected && !chat.pending && lastInput.current) {
      chat.send(orgCommand(orgs, next), lastInput.current);
    } else if (lastInput.current) {
      void run(lastInput.current, next);
    }
  }

  async function run(input: ScoutInput, sel: ReadonlySet<string> = selected) {
    lastInput.current = input;
    setLoading(true);
    setError(null);
    try {
      const res = await postScout(input, orgsParam(sel));
      setShortlist(res.shortlist);
      setRunnersUp(res.runnersUp);
      setOrgCounts(res.orgCounts);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-4xl flex-col px-4">
      <header className="pb-8 pt-10">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="font-serif text-4xl tracking-tight">Issue Scout</h1>
          <span
            title="Never writes to GitHub"
            className="rounded-full border border-line-strong px-2.5 py-0.5 text-xs text-muted"
          >
            read-only
            <span className="sr-only">: never writes to GitHub</span>
          </span>
        </div>
        <p className="mt-2 text-lg text-muted">Find your first issue in LF Decentralized Trust projects.</p>
      </header>

      <main className="flex-1 space-y-8">
        <HandleForm onSubmit={(input) => void run(input)} loading={loading} />

        <OrgFilter orgs={orgs} selected={selected} counts={shortlist ? orgCounts : undefined} onToggle={toggleOrg} />

        <div aria-live="polite" aria-busy={loading} className="space-y-6">
          {loading && (
            <>
              <p role="status" className="flex items-center gap-2 text-sm text-muted">
                <Spinner />
                Finding issues…
              </p>
              <Skeleton />
            </>
          )}
          {error && !loading && (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger p-4"
            >
              <p className="text-danger">{error}</p>
              <button
                type="button"
                onClick={() => lastInput.current && run(lastInput.current)}
                className="rounded-md border border-line-strong px-3 py-1.5 text-sm font-medium hover:bg-inset"
              >
                Retry
              </button>
            </div>
          )}
          {shortlist && !loading && <Shortlist shortlist={shortlist} runnersUp={runnersUp} />}
        </div>

        <ChatStrip hasShortlist={!!shortlist && shortlist.length > 0} chat={chat} seed={lastInput.current} />
      </main>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-6 text-sm text-muted">
        <a href="#" className="underline underline-offset-4">
          Repository
        </a>
      </footer>
    </div>
  );
}
