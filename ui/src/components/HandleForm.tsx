import { useState, type FormEvent } from "react";
import type { ScoutInput } from "../api";
import { Spinner } from "./Spinner";

export const HANDLE_RE = /^[A-Za-z0-9-]{1,39}$/;

/** Returns an error message, or null when valid (same rules as FR-1). */
export function validate(value: string): string | null {
  if (!HANDLE_RE.test(value.trim())) {
    return "Enter a GitHub handle: letters, digits or hyphens, 1 to 39 characters.";
  }
  return null;
}

interface Props {
  onSubmit: (input: ScoutInput) => void;
  loading?: boolean;
}

export function HandleForm({ onSubmit, loading = false }: Props) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handle(e: FormEvent) {
    e.preventDefault();
    const err = validate(value);
    setError(err);
    if (err) return;
    onSubmit({ handle: value.trim() });
  }

  return (
    <form
      onSubmit={handle}
      noValidate
      aria-label="Find issues"
      className="space-y-4 rounded-lg border border-line bg-surface p-5 shadow-sm"
    >
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
          className="block w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-base text-fg"
        />
      </div>
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
    </form>
  );
}
