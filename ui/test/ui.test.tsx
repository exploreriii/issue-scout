import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act, waitFor } from "@testing-library/react";
import { App } from "../src/App";
import { OrgFilter, orgCommand } from "../src/components/OrgFilter";
import type { ScoutResponse } from "../src/api";
import { HandleForm, validate } from "../src/components/HandleForm";
import { Shortlist } from "../src/components/Shortlist";
import { fixture } from "./fixture";

const chatMock = vi.hoisted(() => ({
  send: vi.fn(),
  onShortlist: null as null | ((s: unknown[], meta: unknown) => void),
}));
vi.mock("../src/agent", () => ({
  useScoutChat: (cb: (s: unknown[], meta: unknown) => void) => {
    chatMock.onShortlist = cb;
    return { messages: [], send: chatMock.send, pending: false, connected: true, sessionId: "s" };
  },
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  chatMock.send.mockReset();
});

describe("validate (FR-1)", () => {
  it("accepts good handles and rejects bad ones", () => {
    expect(validate("handle", "octo-cat1")).toBeNull();
    expect(validate("handle", "a".repeat(39))).toBeNull();
    expect(validate("handle", "a".repeat(40))).not.toBeNull();
    expect(validate("handle", "bad_handle")).not.toBeNull();
    expect(validate("handle", "")).not.toBeNull();
    expect(validate("text", "x".repeat(500))).toBeNull();
    expect(validate("text", "x".repeat(501))).not.toBeNull();
  });
});

describe("HandleForm", () => {
  it("shows an error and does not submit an invalid handle", () => {
    const onSubmit = vi.fn();
    render(<HandleForm onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText("GitHub handle"), { target: { value: "no spaces!" } });
    fireEvent.click(screen.getByRole("button", { name: "Find issues" }));
    expect(screen.getByRole("alert").textContent).toMatch(/GitHub handle/);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits a valid handle", () => {
    const onSubmit = vi.fn();
    render(<HandleForm onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText("GitHub handle"), { target: { value: "octocat" } });
    fireEvent.click(screen.getByRole("button", { name: "Find issues" }));
    expect(onSubmit).toHaveBeenCalledWith({ handle: "octocat" });
  });

  it("toggles to free text and submits profileText", () => {
    const onSubmit = vi.fn();
    render(<HandleForm onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole("button", { name: "No handle? Describe yourself instead" }));
    fireEvent.change(screen.getByPlaceholderText("e.g. Python and a bit of Rust, two evenings a week"), { target: { value: "I write Rust" } });
    fireEvent.click(screen.getByRole("button", { name: "Find issues" }));
    expect(onSubmit).toHaveBeenCalledWith({ profileText: "I write Rust" });
  });
});

describe("HandleForm layout", () => {
  it("has no example chips", () => {
    render(<HandleForm onSubmit={vi.fn()} />);
    expect(screen.queryByText("Try")).toBeNull();
    expect(screen.getByPlaceholderText("e.g. myuser")).toBeTruthy();
  });
});

describe("Shortlist", () => {
  it("renders five cards, explanation when present, and runners-up", () => {
    render(<Shortlist shortlist={fixture.shortlist} runnersUp={fixture.runnersUp} />);
    expect(screen.getAllByRole("article")).toHaveLength(5);
    const link = screen.getByRole("link", { name: "Fix thing 1" }) as HTMLAnchorElement;
    expect(link.href).toBe("https://github.com/hiero-ledger/sdk-js/issues/1");
    expect(screen.getByText("A small docs fix.")).toBeTruthy();
    expect(screen.getAllByText("What a first PR looks like")).toHaveLength(1);
    expect(screen.getAllByRole("meter")).toHaveLength(5);
    expect(screen.getByText("Five more, and why they ranked lower")).toBeTruthy();
    expect(screen.getAllByText("Strong match")).toHaveLength(3);
    expect(screen.getByRole("meter", { name: "Good match" })).toBeTruthy();
    expect(screen.getByRole("meter", { name: "Possible match" })).toBeTruthy();
    expect(screen.queryByText(/\/100/)).toBeNull();
    expect(screen.getByText("runner reason 6")).toBeTruthy();
  });
});

const ORGS = [
  { login: "hiero-ledger", displayName: "Hiero Ledger" },
  { login: "hiero-hackers", displayName: "Hiero Hackers" },
];

/** The shared fixture, with the last two shortlist items moved to the second org. */
function twoOrgResponse(): ScoutResponse {
  const move = <T extends { issue: { id: string; org: string; repo: string; url: string } }>(r: T, n: number): T =>
    n < 4 ? r : { ...r, issue: { ...r.issue, org: "hiero-hackers", repo: "hackers-repo", url: `https://github.com/hiero-hackers/hackers-repo/issues/${n}` } };
  return {
    ...fixture,
    shortlist: fixture.shortlist.map((r, i) => move(r, i + 1)),
    runnersUp: [],
    orgCounts: { "hiero-ledger": 3, "hiero-hackers": 2 },
  };
}

describe("OrgFilter", () => {
  it("renders pressed toggles with counts, marks empty orgs, and is keyboard operable", () => {
    const onToggle = vi.fn();
    render(
      <OrgFilter
        orgs={[...ORGS, { login: "LFDT-CLPR", displayName: "LFDT CLPR" }]}
        selected={new Set(["hiero-ledger", "LFDT-CLPR"])}
        counts={{ "hiero-ledger": 18, "hiero-hackers": 4, "LFDT-CLPR": 0 }}
        onToggle={onToggle}
      />,
    );
    expect(screen.getByRole("button", { name: "Hiero Ledger · 18" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Hiero Hackers · 4" }).getAttribute("aria-pressed")).toBe("false");
    const empty = screen.getByRole("button", { name: "LFDT CLPR · 0 open" }) as HTMLButtonElement;
    expect(empty.disabled).toBe(false);
    fireEvent.click(empty);
    expect(onToggle).toHaveBeenCalledWith("LFDT-CLPR");
  });

  it("shows plain names before a shortlist exists and maps a selection to a chat command", () => {
    render(<OrgFilter orgs={ORGS} selected={new Set(["hiero-ledger", "hiero-hackers"])} onToggle={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Hiero Ledger" })).toBeTruthy();
    expect(orgCommand(ORGS, new Set(["hiero-ledger", "hiero-hackers"]))).toBe("all orgs");
    expect(orgCommand(ORGS, new Set(["hiero-ledger"]))).toBe("only orgs hiero-ledger");
  });
});

describe("App org filter", () => {
  function stubFetch() {
    const posts: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === "/orgs") return Response.json(ORGS);
        posts.push(JSON.parse(String(init?.body)));
        return Response.json(twoOrgResponse());
      }),
    );
    return posts;
  }

  it("toggling an org off sends a refine over the chat and re-renders without that org", async () => {
    const posts = stubFetch();
    render(<App />);
    await screen.findByRole("button", { name: "Hiero Hackers" });

    fireEvent.change(screen.getByLabelText("GitHub handle"), { target: { value: "octocat" } });
    fireEvent.click(screen.getByRole("button", { name: "Find issues" }));
    await screen.findByRole("button", { name: "Hiero Hackers · 2" });
    expect(posts).toEqual([{ handle: "octocat" }]);
    expect(screen.getAllByRole("article")).toHaveLength(5);
    expect(screen.getAllByText(/hiero-hackers\/hackers-repo/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Hiero Hackers · 2" }));
    expect(chatMock.send).toHaveBeenCalledWith("only orgs hiero-ledger", { handle: "octocat" });
    expect(posts).toHaveLength(1); // no second /scout request
    expect(screen.getByRole("button", { name: "Hiero Hackers · 2" }).getAttribute("aria-pressed")).toBe("false");

    // The worker answers the refine with the filtered list.
    act(() => chatMock.onShortlist!(twoOrgResponse().shortlist.slice(0, 3), { orgCounts: twoOrgResponse().orgCounts, runnersUp: [] }));
    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(3));
    expect(screen.queryByText(/hiero-hackers\/hackers-repo/)).toBeNull();
  });

  it("before a shortlist exists, toggling only changes the selection sent with Find issues", async () => {
    const posts = stubFetch();
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Hiero Hackers" }));
    expect(chatMock.send).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("GitHub handle"), { target: { value: "octocat" } });
    fireEvent.click(screen.getByRole("button", { name: "Find issues" }));
    await screen.findByRole("button", { name: "Hiero Hackers · 2" });
    expect(posts).toEqual([{ handle: "octocat", orgs: ["hiero-ledger"] }]);
  });
});
