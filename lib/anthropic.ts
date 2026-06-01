import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

export function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it in Vercel → Settings → Environment Variables (or in .env.local for local dev)."
    );
  }
  if (!client) {
    client = new Anthropic({ apiKey });
  }
  return client;
}

// Mirrors _load_model_json() in the Python script: strip code fences, then fall
// back to grabbing the outermost {...} block.
export function parseModelJson<T = unknown>(raw: string): T {
  let text = (raw || "").trim();
  text = text.replace(/^```(?:json)?\s*/gm, "").replace(/\s*```$/gm, "");
  try {
    return JSON.parse(text) as T;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]) as T;
    }
    throw new Error("Model did not return valid JSON.");
  }
}
