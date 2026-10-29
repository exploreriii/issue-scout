import type { OrgConfig, Profile, RawIssue } from "@issue-scout/core";

export interface IssueSource {
  fetchOpenIssues(org: OrgConfig): Promise<RawIssue[]>;
}

export interface ProfileSource {
  fetchProfile(handle: string): Promise<Profile>;
}

export interface Cache {
  get<T>(key: string): Promise<T | null>;
  put<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
}

/** Parsed from x-ratelimit-* response headers; null until a response has been seen. */
export interface RateLimitInfo {
  limit: number | null;
  remaining: number | null;
  /** Epoch seconds at which the window resets. */
  resetAt: number | null;
}

export class InvalidHandleError extends Error {
  constructor(handle: string) {
    super(`Invalid GitHub handle: ${JSON.stringify(handle.slice(0, 60))}`);
    this.name = "InvalidHandleError";
  }
}

export class InvalidProfileTextError extends Error {
  constructor(message = "Profile text must be 1-500 characters") {
    super(message);
    this.name = "InvalidProfileTextError";
  }
}

export class ProfileNotFoundError extends Error {
  constructor(handle: string) {
    super(`GitHub user not found: ${handle}`);
    this.name = "ProfileNotFoundError";
  }
}

export class GithubApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "GithubApiError";
  }
}

export class GithubRateLimitError extends GithubApiError {
  constructor(readonly resetAt: number | null) {
    super("GitHub API rate limit exceeded", 403);
    this.name = "GithubRateLimitError";
  }
}
