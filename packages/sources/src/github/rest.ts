import { profileFromGithub, type GithubRepo, type Profile } from "@issue-scout/core";
import { GithubApiError, InvalidHandleError, ProfileNotFoundError, type ProfileSource, type RateLimitInfo } from "../types.js";
import { GithubHttp, type GithubClientOptions } from "./graphql.js";

export const HANDLE_RE = /^[A-Za-z0-9-]{1,39}$/;
export const API_BASE = "https://api.github.com";

export function isValidHandle(handle: unknown): handle is string {
  return typeof handle === "string" && HANDLE_RE.test(handle);
}

export function assertValidHandle(handle: unknown): asserts handle is string {
  if (!isValidHandle(handle)) throw new InvalidHandleError(typeof handle === "string" ? handle : String(handle));
}

/** ProfileSource backed by the GitHub REST API (GET requests only). */
export class GithubProfileSource implements ProfileSource {
  readonly http: GithubHttp;

  constructor(opts: GithubClientOptions = {}) {
    this.http = new GithubHttp(opts);
  }

  get rateLimit(): RateLimitInfo {
    return this.http.rateLimit;
  }

  private async getJson<T>(path: string, handle: string): Promise<T> {
    const res = await this.http.request(`${API_BASE}${path}`);
    if (res.status === 404) throw new ProfileNotFoundError(handle);
    if (!res.ok) throw new GithubApiError(`GitHub REST returned HTTP ${res.status} for ${path.split("?")[0]}`, res.status);
    return (await res.json()) as T;
  }

  async fetchProfile(handle: string): Promise<Profile> {
    assertValidHandle(handle);
    const h = encodeURIComponent(handle);
    const [user, repos, prs] = await Promise.all([
      this.getJson<{ login: string }>(`/users/${h}`, handle),
      this.getJson<GithubRepo[]>(`/users/${h}/repos?per_page=100&sort=pushed`, handle),
      this.getJson<{ total_count: number }>(`/search/issues?q=type:pr+is:merged+author:${h}&per_page=1`, handle),
    ]);
    return profileFromGithub({ login: user.login }, repos, prs.total_count ?? 0);
  }
}
