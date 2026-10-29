export { explain, type AiBinding, type ExplainDeps, type ExplainResult } from "./workersAi.js";
export { buildSystemPrompt, buildUserPrompt, BODY_MAX_CHARS } from "./prompt.js";
export { ExplanationArray, ExplanationOutSchema, explanationJsonSchema } from "./schema.js";
export { extractJsonArray } from "./extract.js";
/** Default model: kimi-k2.6, the structured-output model in the Workers AI catalogue. */
export const DEFAULT_MODEL = "@cf/moonshotai/kimi-k2.6";
