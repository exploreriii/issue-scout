export interface Env {
  AI: Ai;
  CACHE: KVNamespace;
  ASSETS: Fetcher;
  IssueScoutAgent: DurableObjectNamespace;
  ORGS_FILE: string;
  /** Optional Worker secret: read-only, public-repo scope (FR-15). */
  GITHUB_TOKEN?: string;
  /** Workers AI model override; defaults to the explainer's DEFAULT_MODEL. */
  AI_MODEL?: string;
  /** Presence only is reported by /health; no documented env.AI.run gateway option. */
  AI_GATEWAY_ID?: string;
}
