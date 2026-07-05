import OpenAI from "openai";
import { openAIAuthError } from "@/lib/openai";
import {
  buildSortPrompt,
  buildVerifyGroupPrompt,
  buildVerifyMergePrompt,
  slugifyFolderName,
} from "@/lib/prompts";
import type { WireImage } from "@/lib/images";

const GROUP_MODEL = "gpt-4.1-mini";
const CHECK_MODEL = "gpt-4.1-mini";
const BATCH_SIZE = 10;

const GROUP_CONCURRENCY = 2;
const VERIFY_CONCURRENCY = 3;
const MERGE_CONCURRENCY = 4;

const RETRYABLE_STATUS = new Set([408, 409, 429, 500, 502, 503, 504]);

export interface SortGroup {
  name: string;
  photoIndices: number[];
}

export interface SortResult {
  groups: SortGroup[];
  orphanIndices: number[];
}

export class SortUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SortUnavailableError";
  }
}

type OpenAITextContent = { type: "text"; text: string };
type OpenAIImageContent = { type: "image_url"; image_url: { url: string } };
type OpenAIContent = OpenAITextContent | OpenAIImageContent;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function rawBase64(data: string): string {
  return data.includes(",") ? data.split(",")[1] : data;
}

function imageBlock(img: WireImage | undefined): OpenAIImageContent | null {
  if (!img?.data) return null;
  if (!["image/jpeg", "image/png", "image/webp"].includes(img.mediaType)) return null;

  const data = rawBase64(img.data);

  return {
    type: "image_url",
    image_url: {
      url: `data:${img.mediaType};base64,${data}`,
    },
  };
}

function labeledContent(images: WireImage[], labelStart = 1): OpenAIContent[] {
  const content: OpenAIContent[] = [];

  images.forEach((img, i) => {
    const block = imageBlock(img);
    if (!block) return;

    content.push({ type: "text", text: `Photo ${labelStart + i}:` });
    content.push(block);
  });

  return content;
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

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i], i);
    }
  });

  await Promise.all(workers);
  return results;
}

async function openAIJson<T>(
  client: OpenAI,
  model: string,
  content: OpenAIContent[],
  maxTokens: number,
  label: string
): Promise<T | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const resp = await client.chat.completions.create({
        model,
        max_tokens: maxTokens,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              ...content,
              { type: "text", text: "Return valid JSON only." },
            ],
          },
        ],
      });

      return parseJson<T>(resp.choices[0]?.message?.content ?? "");
    } catch (e) {
      const status =
        e && typeof e === "object" && "status" in e
          ? Number((e as { status?: number }).status)
          : undefined;

      const fatal = openAIAuthError(e);
      if (fatal) throw fatal;

      const retryable = status === undefined || RETRYABLE_STATUS.has(status);

      if (attempt < 3 && retryable) {
        const wait = Math.min(10000, 800 * 2 ** attempt) + Math.floor(Math.random() * 400);
        console.warn(`[sort] ${label}: ${status ?? "parse/conn"} error — retry ${attempt + 1} in ${wait}ms`);
        await sleep(wait);
        continue;
      }

      console.warn(`[sort] ${label}: giving up (${status ?? (e as Error).message})`);
      return null;
    }
  }

  return null;
}

async function groupPhotos(
  client: OpenAI,
  images: WireImage[],
  model: string
): Promise<{ name: string; indices: number[] }[]> {
  const total = images.length;
  const batches: { offset: number; batch: WireImage[]; labelStart: number; labelEnd: number }[] = [];

  for (let offset = 0; offset < total; offset += BATCH_SIZE) {
    const batch = images.slice(offset, offset + BATCH_SIZE);
    batches.push({ offset, batch, labelStart: offset + 1, labelEnd: offset + batch.length });
  }

  const perBatch = await mapLimit(batches, GROUP_CONCURRENCY, async (b) => {
    const content: OpenAIContent[] = [...labeledContent(b.batch, b.labelStart)];

    const note =
      b.offset > 0
        ? ` (These are photos ${b.labelStart}–${b.labelEnd} of ${total} total. Group only the photos shown above.)`
        : "";

    content.push({
      type: "text",
      text: buildSortPrompt(b.batch.length, b.labelStart, b.labelEnd, note),
    });

    const data = await openAIJson<{
      groups?: { folder_name?: string; photo_indices?: number[] }[];
    }>(client, model, content, 2000, `group ${b.labelStart}-${b.labelEnd}`);

    const out: { name: string; indices: number[] }[] = [];

    for (const g of data?.groups ?? []) {
      const indices: number[] = [];

      for (const idx of g.photo_indices ?? []) {
        const real = Number(idx) - 1;
        if (Number.isInteger(real) && real >= 0 && real < total) indices.push(real);
      }

      if (indices.length) out.push({ name: slugifyFolderName(g.folder_name ?? "item"), indices });
    }

    return { out, failed: data === null };
  });

  if (perBatch.length > 0 && perBatch.every((b) => b.failed)) {
    throw new SortUnavailableError(
      "The photo-sorting service was unavailable or rate-limited — every request failed. Wait a minute and try again."
    );
  }

  return perBatch.flatMap((b) => b.out);
}

async function verifyGroups(
  client: OpenAI,
  images: WireImage[],
  groups: { name: string; indices: number[] }[],
  model: string
): Promise<{ groups: { name: string; indices: number[] }[]; orphans: number[] }> {
  const orphans: number[] = [];

  const checks = await mapLimit(groups, VERIFY_CONCURRENCY, async (group) => {
    if (group.indices.length === 1) return group;

    const content = labeledContent(group.indices.map((i) => images[i]), 1);
    content.push({ type: "text", text: buildVerifyGroupPrompt(group.indices.length) });

    const result = await openAIJson<{ valid?: boolean; keep_indices?: number[] }>(
      client,
      model,
      content,
      300,
      `verify ${group.name}`
    );

    if (!result || result.valid !== false) return group;

    const keepRaw = result.keep_indices ?? [];
    if (keepRaw.length === 0) return group;

    const keepSet = new Set(keepRaw.map((x) => Number(x) - 1));
    const kept: number[] = [];

    group.indices.forEach((globalIdx, localIdx) => {
      if (keepSet.has(localIdx)) kept.push(globalIdx);
      else orphans.push(globalIdx);
    });

    return kept.length > 0 ? { name: group.name, indices: kept } : group;
  });

  return { groups: checks, orphans };
}

async function mergeSplitGroups(
  client: OpenAI,
  images: WireImage[],
  groups: { name: string; indices: number[] }[],
  model: string
): Promise<{ name: string; indices: number[] }[]> {
  if (groups.length < 2) return groups;

  const pairs = groups.slice(0, -1);

  const pairVotes = await mapLimit(pairs, MERGE_CONCURRENCY, async (group, i) => {
    const next = groups[i + 1];
    const aBlock = imageBlock(images[group.indices[0]]);
    const bBlock = imageBlock(images[next.indices[0]]);

    if (!aBlock || !bBlock) return false;

    const content: OpenAIContent[] = [
      { type: "text", text: "Photo 1:" },
      aBlock,
      { type: "text", text: "--- Group B ---" },
      { type: "text", text: "Photo 2:" },
      bBlock,
      { type: "text", text: buildVerifyMergePrompt(group.indices.length, next.indices.length) },
    ];

    const result = await openAIJson<{ merge?: boolean }>(
      client,
      model,
      content,
      100,
      `merge ${i}`
    );

    return result?.merge === true;
  });

  const merged: { name: string; indices: number[] }[] = [];
  let i = 0;

  while (i < groups.length) {
    if (i < groups.length - 1 && pairVotes[i]) {
      merged.push({
        name: groups[i].name,
        indices: [...groups[i].indices, ...groups[i + 1].indices],
      });
      i += 2;
    } else {
      merged.push(groups[i]);
      i += 1;
    }
  }

  return merged;
}

function uniqueNames(groups: { name: string; indices: number[] }[]): SortGroup[] {
  const counts = new Map<string, number>();

  return groups.map((g) => {
    const n = (counts.get(g.name) ?? 0) + 1;
    counts.set(g.name, n);

    return { name: n === 1 ? g.name : `${g.name}-${n}`, photoIndices: g.indices };
  });
}

export async function checkMergePair(
  client: OpenAI,
  imageA: WireImage,
  imageB: WireImage,
  countA: number,
  countB: number,
  model?: string
): Promise<boolean> {
  const aBlock = imageBlock(imageA);
  const bBlock = imageBlock(imageB);

  if (!aBlock || !bBlock) return false;

  const content: OpenAIContent[] = [
    { type: "text", text: "Photo 1:" },
    aBlock,
    { type: "text", text: "--- Group B ---" },
    { type: "text", text: "Photo 2:" },
    bBlock,
    { type: "text", text: buildVerifyMergePrompt(countA, countB) },
  ];

  const result = await openAIJson<{ merge?: boolean }>(
    client,
    model ?? CHECK_MODEL,
    content,
    100,
    "merge chunk-boundary"
  );

  return result?.merge === true;
}

export async function sortPhotos(
  client: OpenAI,
  images: WireImage[],
  model?: string
): Promise<SortResult> {
  const m = model ?? GROUP_MODEL;
  const grouped = await groupPhotos(client, images, m);

  if (grouped.length === 0) return { groups: [], orphanIndices: [] };

  const verified = await verifyGroups(client, images, grouped, m);
  const merged = await mergeSplitGroups(client, images, verified.groups, m);

  return { groups: uniqueNames(merged), orphanIndices: verified.orphans };
}