import { NextResponse } from "next/server";
import { getOpenAIClient, openAIAuthError, OpenAIAuthError } from "@/lib/openai";

export async function GET() {
  try {
    const client = getOpenAIClient();

    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: "Say: OpenAI is connected.",
    });

    return NextResponse.json({
      ok: true,
      text: response.output_text,
    });
  } catch (e) {
    console.error(e);

    const fatal = openAIAuthError(e);

    if (fatal instanceof OpenAIAuthError) {
      return NextResponse.json(
        { ok: false, error: fatal.message },
        { status: fatal.status }
      );
    }

    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 }
    );
  }
}