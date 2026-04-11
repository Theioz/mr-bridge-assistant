export const dynamic = "force-dynamic";

import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const categories = ["science", "history", "space", "nature", "psychology", "technology", "mathematics", "biology", "linguistics", "geography"];
    const category = categories[Math.floor(Math.random() * categories.length)];

    const { text } = await generateText({
      model: anthropic("claude-haiku-4-5-20251001"),
      maxTokens: 150,
      prompt: `Give me one genuinely interesting and surprising fact specifically about ${category}. It should be something most people don't know. Return just the fact as a single sentence or two. No intro like 'Did you know'. Just the fact.`,
    });

    return NextResponse.json(
      { fact: text.trim() },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("[fun-fact] error:", err);
    return NextResponse.json(
      { fact: null, error: "Failed to generate fun fact" },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
}
