import { z } from "zod";

/** Terse answers ("not ideal") are rejected so they trigger the retry. */
export const MIN_TEXT_CHARS = 40;

/** Model output shape. Unknown keys are stripped; effortHours is coerced from strings like "2" and must be an integer 1-40. */
export const ExplanationOutSchema = z
  .object({
    issueId: z.string(),
    fit: z.string().min(MIN_TEXT_CHARS),
    firstPrLooksLike: z.string().min(MIN_TEXT_CHARS),
    effortHours: z.coerce.number().int().min(1).max(40),
    firstStep: z.string().min(MIN_TEXT_CHARS),
  })
  .strip();

export const ExplanationArray = z.array(ExplanationOutSchema);

/** The same shape as a JSON Schema, passed to Workers AI response_format. */
export const explanationJsonSchema = {
  type: "array",
  items: {
    type: "object",
    properties: {
      issueId: { type: "string" },
      fit: { type: "string", minLength: 40, description: "One or two complete sentences (15-45 words) on why this issue suits you, specific to the issue." },
      firstPrLooksLike: { type: "string", minLength: 40, description: "One or two complete sentences (15-45 words) on what your first PR would contain, naming the file, module or function." },
      effortHours: { type: "integer", minimum: 1, maximum: 40, description: "Estimated whole hours for a newcomer." },
      firstStep: { type: "string", minLength: 40, description: "One or two complete sentences (15-45 words) on the first concrete thing you should do." },
    },
    required: ["issueId", "fit", "firstPrLooksLike", "effortHours", "firstStep"],
    additionalProperties: false,
  },
} as const;
