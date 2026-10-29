/** Tolerant JSON extraction from model text: strips code fences, then takes first '[' to last ']'. */
export function extractJsonArray(text: string): unknown {
  const stripped = text.replace(/```[a-zA-Z]*\s*/g, "").replace(/```/g, "");
  const start = stripped.indexOf("[");
  const end = stripped.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("no JSON array found in model output");
  }
  return JSON.parse(stripped.slice(start, end + 1));
}
