import OpenAI from "openai";

let client: OpenAI | null = null;
export function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not set. Add it in .env.local for local dev or in Vercel → Settings → Environment Variables."
    );
  }

  if (!client) {
    client = new OpenAI({ apiKey });
  }

  return client;
}

 export class OpenAIAuthError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "OpenAIAuthError";
    this.status = status;
  }
}

export function openAIAuthError(e: unknown): OpenAIAuthError | null {
  const status =
    e && typeof e === "object" && "status" in e
      ? Number((e as { status?: number }).status)
      : undefined;

  const message =
    e && typeof e === "object" && "message" in e
      ? String((e as { message?: unknown }).message ?? "")
      : "";

  if (status === 401) {
    return new OpenAIAuthError(
      "OpenAI rejected your API key. Check that OPENAI_API_KEY is set correctly.",
      401
    );
  }

  if (status === 403) {
    return new OpenAIAuthError(
      "Your OpenAI API key is not permitted to use this model.",
      403
    );
  }

  if (
    status === 429 ||
    /quota|billing|payment|insufficient|rate limit/i.test(message)
  ) {
    return new OpenAIAuthError(
      "Your OpenAI account cannot cover this request right now. Check billing, credits, or rate limits.",
      429
    );
  }

  return null;
}