import {
  GithubApiError,
  GithubRateLimitError,
  InvalidHandleError,
  InvalidProfileTextError,
  ProfileNotFoundError,
} from "@issue-scout/sources";

export interface Described {
  status: number;
  message: string;
  retryAfterSeconds?: number;
}

/** Map a flow failure to a status and a user-safe message. Messages never echo the input (NFR-6). */
export function describeError(e: unknown, now: Date = new Date()): Described {
  if (e instanceof InvalidHandleError) {
    return { status: 400, message: "That is not a valid GitHub handle (letters, digits and hyphens, up to 39 characters)." };
  }
  if (e instanceof InvalidProfileTextError) {
    return { status: 400, message: "Profile text must be between 1 and 500 characters." };
  }
  if (e instanceof ProfileNotFoundError) return { status: 404, message: "I could not find that GitHub user." };
  if (e instanceof GithubRateLimitError) {
    const wait = e.resetAt ? Math.max(1, Math.ceil(e.resetAt - now.getTime() / 1000)) : 60;
    return { status: 503, message: "GitHub is rate limiting this service right now. Try again in a few minutes.", retryAfterSeconds: wait };
  }
  if (e instanceof GithubApiError && e.message.startsWith("GitHub rejected an unauthenticated request")) {
    return { status: 503, message: "GitHub requires a token for this service. The operator must set GITHUB_TOKEN (read-only)." };
  }
  if (e instanceof GithubApiError) return { status: 502, message: "GitHub did not answer. Try again shortly." };
  return { status: 500, message: "Something went wrong. Try again shortly." };
}

/** Log the error class only: messages can carry handles. */
export function logFailure(where: string, e: unknown): void {
  console.error(`${where} failed: ${e instanceof Error ? e.name : "unknown"}`);
}
