import type { Explanation, Profile, Ranked } from "@issue-scout/core";
import { extractJsonArray } from "./extract.js";
import { buildSystemPrompt, buildUserPrompt } from "./prompt.js";
import { ExplanationArray, explanationJsonSchema } from "./schema.js";

export interface AiBinding {
  run(model: string, input: unknown): Promise<unknown>;
}

export interface ExplainDeps {
  ai: AiBinding;
  model: string;
  // TODO: no documented env.AI.run gateway option exists (only the REST header
  // cf-aig-gateway-id). Accepted but not forwarded until the Workers form is confirmed.
  gatewayId?: string;
  maxTokens?: number;
  contributingSummaries?: Record<string, string>;
}

export interface ExplainResult {
  explanations: Explanation[];
  status: "ok" | "unavailable";
}

type Message = { role: "system" | "user" | "assistant"; content: string };

/** Pull the model's payload out of a Workers AI response (`response` field; also tolerates OpenAI-style choices). */
function extractPayload(res: unknown): unknown {
  if (typeof res !== "object" || res === null) throw new Error("empty model response");
  const r = res as Record<string, unknown>;
  let raw: unknown = r.response;
  if (raw === undefined || raw === null) {
    const choices = r.choices as Array<{ message?: { content?: unknown } }> | undefined;
    raw = choices?.[0]?.message?.content;
  }
  if (typeof raw === "string") return extractJsonArray(raw);
  if (Array.isArray(raw)) return raw; // JSON mode may return already-parsed output
  throw new Error("model response had no usable text");
}

export async function explain(
  top: Ranked[],
  profile: Profile,
  deps: ExplainDeps,
): Promise<ExplainResult> {
  if (top.length === 0) return { explanations: [], status: "ok" };

  const messages: Message[] = [
    { role: "system", content: buildSystemPrompt() },
    { role: "user", content: buildUserPrompt(profile, top, deps.contributingSummaries) },
  ];
  const input = (msgs: Message[]) => ({
    messages: msgs,
    max_tokens: deps.maxTokens ?? 1600,
    temperature: 0.2,
    response_format: { type: "json_schema", json_schema: explanationJsonSchema },
  });

  const attempt = async (msgs: Message[]): Promise<Explanation[] | null> => {
    try {
      const res = await deps.ai.run(deps.model, input(msgs));
      const parsed = ExplanationArray.safeParse(extractPayload(res));
      if (!parsed.success) console.warn(`explainer: response did not match schema (${parsed.error.issues.length} issues)`);
      return parsed.success ? parsed.data : null;
    } catch (e) {
      // Never throws out of explain(); log the error class and message only (no prompt content).
      const err = e as { name?: string; message?: string };
      console.warn(`explainer: model call failed: ${err?.name ?? "Error"}: ${(err?.message ?? "").slice(0, 300)}`);
      return null;
    }
  };

  const first = await attempt(messages);
  if (first) return { explanations: first, status: "ok" };

  const second = await attempt([...messages, { role: "user", content: "Return only the JSON array." }]);
  if (second) return { explanations: second, status: "ok" };

  return { explanations: [], status: "unavailable" };
}
