import { z } from "zod";

/** Model output shape. Unknown keys are stripped; effortHours is coerced from strings like "2". */
export const ExplanationOutSchema = z
  .object({
    issueId: z.string(),
    fit: z.string(),
    firstPrLooksLike: z.string(),
    effortHours: z.coerce.number().finite(),
    firstStep: z.string(),
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
      fit: { type: "string", description: "Why this issue suits this contributor. Max 60 words." },
      firstPrLooksLike: { type: "string", description: "What a first PR would contain. Max 60 words." },
      effortHours: { type: "number", description: "Estimated hours for a newcomer." },
      firstStep: { type: "string", description: "The first concrete step to take. Max 60 words." },
    },
    required: ["issueId", "fit", "firstPrLooksLike", "effortHours", "firstStep"],
    additionalProperties: false,
  },
} as const;
