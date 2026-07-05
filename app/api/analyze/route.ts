import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getOpenAIClient, OpenAIAuthError, openAIAuthError } from "@/lib/openai";
import { guardApiRequest, safeErrorResponse } from "@/lib/api-guard";
import {
  PROFILE_ROUTER_PROMPT,
  buildProfiledAnalysisPrompt,
  normalizeItemProfile,
} from "@/lib/prompts";
import type { AnalyzeRequestBody, ListingResult } from "@/lib/types";

export const maxDuration = 60;

const ANALYSIS_MODEL = "gpt-4.1-mini";
const ROUTER_MODEL = "gpt-4.1-mini";
const MAX_IMAGES = 12;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MEDIA = new Set(["image/jpeg", "image/png", "image/webp"]);

type OpenAIImageContent = {
  type: "image_url";
  image_url: { url: string };
};

type OpenAITextContent = {
  type: "text";
  text: string;
};

function rawBase64(data: string): string {
  return data.includes(",") ? data.split(",")[1] : data;
}

function toOpenAIImageBlock(
  img: AnalyzeRequestBody["images"][number] | undefined
): OpenAIImageContent | null {
  if (!img?.data || !ALLOWED_MEDIA.has(img.mediaType)) return null;

  const data = rawBase64(img.data);
  if (data.length * 0.75 > MAX_IMAGE_BYTES) return null;

  return {
    type: "image_url",
    image_url: {
      url: `data:${img.mediaType};base64,${data}`,
    },
  };
}

function toImageBlocks(images: AnalyzeRequestBody["images"]): OpenAIImageContent[] {
  const blocks: OpenAIImageContent[] = [];

  for (const img of images.slice(0, MAX_IMAGES)) {
    const block = toOpenAIImageBlock(img);
   
    if (block) blocks.push(block);
  }

  return blocks;
}

function firstText(resp: OpenAI.Chat.Completions.ChatCompletion): string {
  return resp.choices[0]?.message?.content?.trim() ?? "";
}

function parseJson<T = unknown>(raw: string): T {
  let text = (raw || "").trim();
  text = text.replace(/^```(?:json)?\s*/gm, "").replace(/\s*```$/gm, "");

  try {
    return JSON.parse(text) as T;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]) as T;
    throw new Error("Model did not return valid JSON.");
  }
}

async function routeProfile(
  client: OpenAI,
  imageBlocks: OpenAIImageContent[],
  requested: string,
  routerModel: string
): Promise<string> {
  const forced = normalizeItemProfile(requested);
  if (forced !== "auto") return forced;

  try {
    const resp = await client.chat.completions.create({
      model: routerModel,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            ...imageBlocks,
            {
              type: "text",
              text: PROFILE_ROUTER_PROMPT + "\n\nReturn JSON only.",
            },
          ] as Array<OpenAIImageContent | OpenAITextContent>,
        },
      ],
    });

    const data = parseJson<{ profile?: string }>(firstText(resp));
    const routed = normalizeItemProfile(data?.profile ?? "auto");
    return routed !== "auto" ? routed : "hard_goods";
  } catch (e) {
    const fatal = openAIAuthError(e);
    if (fatal) throw fatal;
    return "hard_goods";
  }
}

export async function POST(req: NextRequest) {
  const denied = guardApiRequest(req);
  if (denied) return denied;

  let body: AnalyzeRequestBody;

  try {
    body = (await req.json()) as AnalyzeRequestBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request body." },
      { status: 400 }
    );
  }

  if (!Array.isArray(body.images) || body.images.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Please add at least one photo." },
      { status: 400 }
    );
  }

  const imageBlocks = toImageBlocks(body.images);
  const sellerFacts = (body.sellerFacts ?? "").trim();

  if (imageBlocks.length === 0) {
    return NextResponse.json(
      { ok: false, error: "No readable photos found. Use JPG, PNG, or WebP." },
      { status: 400 }
    );
  }

  let client: OpenAI;

  try {
    client = getOpenAIClient();
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 }
    );
  }

  try {
    const profile = await routeProfile(client, imageBlocks, body.profile, ROUTER_MODEL);
    const systemPrompt = buildProfiledAnalysisPrompt(profile);

    let lastErr: unknown = null;

    for (let attempt = 0; attempt < 3; attempt++) {
  try {
    const resp = await client.chat.completions.create({
      model: ANALYSIS_MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            systemPrompt +
            "\n\nReturn valid JSON only. Do not include markdown or commentary.",
        },
        {
          role: "user",
          content: [
            ...imageBlocks,
            {
              type: "text",
              text:
  (sellerFacts
    ? `SELLER VERIFIED FACTS — HIGHEST PRIORITY:
${sellerFacts}

Before using these notes, silently correct obvious spelling mistakes, typos, capitalization, and common jewelry/resale terminology.

Examples:
- sterlling → sterling
- predidium → Presidium
- coroo → Coro
- vintge → vintage
- goldtone → gold tone
- silvertone → silver tone
- earings → earrings
- braclet → bracelet
- neckace → necklace

Do not change the meaning. Do not add new facts. Do not mention spelling corrections.

Treat the corrected seller facts as true. If seller facts conflict with photo guesses, ALWAYS use the seller facts.

`
    : "") + "Analyze these photos and return the listing JSON now.",
            },
          ] as Array<OpenAIImageContent | OpenAITextContent>,
        },
      ],
    });

    const listing = parseJson<ListingResult>(firstText(resp));
    listing.item_profile = profile;

    return NextResponse.json({ ok: true, listing });
  } catch (err) {
    const fatal = openAIAuthError(err);
    if (fatal) throw fatal;

    lastErr = err;

    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
}
    throw lastErr;
  } catch (e) {
    if (e instanceof OpenAIAuthError) {
      console.error("[analyze] auth/billing failure:", e.message);
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    }

    return safeErrorResponse(
      "analyze",
      e,
      "Something went wrong analyzing photos — please try again."
    );
  }
}