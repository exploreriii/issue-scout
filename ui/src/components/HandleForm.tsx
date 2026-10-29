import { useState, type FormEvent } from "react";
import type { ScoutInput } from "../api";
import { Spinner } from "./Spinner";

export const HANDLE_RE = /^[A-Za-z0-9-]{1,39}$/;
export const MAX_PROFILE_TEXT = 500;

/** Returns an error message, or null when valid (same rules as FR-1). */
export function validate(mode: "handle" | "text", value: string): string | null {
  const v = value.trim();
  if (mode === "handle") {
    if (!HANDLE_RE.test(v)) {
      return "Enter a GitHub handle: letters, digits or hyphens, 1 to 39 characters.";
    }
    return null;
  }
  if (v.length === 0) return "Describe yourself in a sentence or two.";
  if (v.length > MAX_PROFILE_TEXT) {
    return `Keep the description to ${MAX_PROFILE_TEXT} characters or fewer.`;
  }
  return null;
}

interface Props {
  onSubmit: (input: ScoutInput) => void;
  loading?: boolean;
}

export function HandleForm({ onSubmit, loading = false }: Props) {
  const [mode, setMode] = useState<"handle" | "text">("handle");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handle(e: FormEvent) {
    e.preventDefault();
    const err = validate(mode, value);
    setError(err);
    if (err) return;
    const v = value.trim();
    onSubmit(mode === "handle" ? { handle: v } : { profileText: v });
  }

  function switchMode() {
    setMode((m) => (m === "handle" ? "text" : "handle"));
    setValue("");
    setError(null);
  }

  const inputClass =
    "block w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-base text-fg";

  return (
    <form
      onSubmit={handle}
      noValidate
      aria-label="Find issues"
      className="space-y-4 rounded-lg border border-line bg-surface p-5 shadow-sm"
    >
      {mode === "handle" ? (
        <div>
          <label htmlFor="handle" className="mb-1.5 block text-sm font-medium">
            GitHub handle
          </label>
          <input
            id="handle"
            name="handle"
            type="text"
            autoComplete="off"
            spellCheck={false}
            placeholder="e.g. myuser"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "form-error" : undefined}
            className={inputClass}
          />
        </div>
      ) : (
        <div>
          <label htmlFor="profileText" className="mb-1.5 block text-sm font-medium">
            Describe yourself
          </label>
          <textarea
            id="profileText"
            name="profileText"
            rows={4}
            placeholder="e.g. Python and a bit of Rust, two evenings a week"
            maxLength={MAX_PROFILE_TEXT + 100}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "form-error" : "profile-hint"}
            className={inputClass}
          />
          <p id="profile-hint" className="mt-1.5 text-sm text-muted">
            Languages, experience, time available. {value.length}/{MAX_PROFILE_TEXT}
          </p>
        </div>
      )}
      {error && (
        <p id="form-error" role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={loading}
        aria-busy={loading || undefined}
        className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 font-medium text-white hover:brightness-110 disabled:cursor-not-allowed disabled:bg-line disabled:text-muted disabled:hover:brightness-100"
      >
        {loading && <Spinner />}
        {loading ? "Searching…" : "Find issues"}
      </button>
      <p>
        <button type="button" onClick={switchMode} className="text-sm text-muted underline underline-offset-4 hover:text-fg">
          {mode === "handle" ? "No handle? Describe yourself instead" : "Use a GitHub handle instead"}
        </button>
      </p>
    </form>
  );
}
