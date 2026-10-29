export { explain, type AiBinding, type ExplainDeps, type ExplainResult } from "./workersAi.js";
export { buildSystemPrompt, buildUserPrompt, BODY_MAX_CHARS } from "./prompt.js";
export { ExplanationArray, ExplanationOutSchema, explanationJsonSchema } from "./schema.js";
export { extractJsonArray } from "./extract.js";
/** Default model: a Workers Free plan model that honours response_format json_schema. Override with env.AI_MODEL. */
export const DEFAULT_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
