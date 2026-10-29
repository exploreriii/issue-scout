import { z } from "zod";

export const ProfileSchema = z.object({
  source: z.enum(["github", "text"]),
  handle: z.string().optional(),
  languages: z.array(z.object({ name: z.string(), weight: z.number() })),
  experienceBand: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  timeBudgetHours: z.number().positive().optional(),
  wantsTests: z.boolean().optional(),
  excludeRepos: z.array(z.string()),
});
export type Profile = z.infer<typeof ProfileSchema>;

export const RawIssueSchema = z.object({
  id: z.string(),
  org: z.string(),
  repo: z.string(),
  number: z.number().int(),
  title: z.string(),
  body: z.string(),
  url: z.string(),
  labels: z.array(z.string()),
  assignees: z.number().int().nonnegative(),
  comments: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
  repoLanguage: z.string().optional(),
  repoTopics: z.array(z.string()),
  repoLastMergedPrAt: z.string().optional(),
  // Additive, optional: text of the most recent comment, used for the
  // "nobody has asked to take it" rule (ARCHITECTURE s5).
  lastComment: z.string().optional(),
});
export type RawIssue = z.infer<typeof RawIssueSchema>;

export const TierSchema = z.enum(["firstIssue", "helpWanted"]);
export type Tier = z.infer<typeof TierSchema>;

export const CandidateSchema = RawIssueSchema.extend({ tier: TierSchema });
export type Candidate = z.infer<typeof CandidateSchema>;

export const RankedSchema = z.object({
  issue: CandidateSchema,
  score: z.number(),
  reasons: z.array(z.string()),
});
export type Ranked = z.infer<typeof RankedSchema>;

export const ExplanationSchema = z.object({
  issueId: z.string(),
  fit: z.string(),
  firstPrLooksLike: z.string(),
  effortHours: z.number(),
  firstStep: z.string(),
});
export type Explanation = z.infer<typeof ExplanationSchema>;

export const PreferencesSchema = z.object({
  languages: z.array(z.string()).optional(),
  /** Org logins to include; absent means all enabled orgs. A hard filter applied before ranking. */
  orgs: z.array(z.string()).optional(),
  timeBudgetHours: z.number().positive().optional(),
  wantsTests: z.boolean().optional(),
  excludeRepos: z.array(z.string()),
  excludeIssues: z.array(z.string()),
});
export type Preferences = z.infer<typeof PreferencesSchema>;

export const OrgConfigSchema = z.object({
  login: z.string().min(1),
  displayName: z.string().min(1),
  enabled: z.boolean(),
  labels: z.object({
    firstIssue: z.array(z.string().min(1)),
    helpWanted: z.array(z.string().min(1)),
    claimed: z.array(z.string().min(1)),
    exclude: z.array(z.string().min(1)),
  }),
  defaultLanguages: z.array(z.string()),
});
export type OrgConfig = z.infer<typeof OrgConfigSchema>;
