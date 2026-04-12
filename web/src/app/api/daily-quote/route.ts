export const dynamic = "force-dynamic";

import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const supabase = createServiceClient();

    // Check for a cached quote from today
    const { data: cacheRow } = await supabase
      .from("profile")
      .select("value")
      .eq("key", "quote_cache")
      .maybeSingle();

    if (cacheRow?.value) {
      try {
        const cached = JSON.parse(cacheRow.value);
        if (cached.date === today && cached.quote) {
          return NextResponse.json({ quote: cached.quote, author: cached.author ?? null });
        }
      } catch {
        // corrupted cache — fall through to regenerate
      }
    }

    // Generate a fresh quote
    const { text } = await generateText({
      model: anthropic("claude-haiku-4-5-20251001"),
      maxTokens: 120,
      prompt: `Give me one short, powerful motivational or philosophical quote. Prefer lesser-known quotes over overused ones. Respond with only a raw JSON object — no markdown, no code fences, no extra text. Format: {"quote":"...","author":"..."}`,
    });

    let quote = text.trim();
    let author: string | null = null;

    try {
      // Strip markdown code fences if the model wrapped the response
      const stripped = quote.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
      const parsed = JSON.parse(stripped);
      quote = parsed.quote ?? quote;
      author = parsed.author ?? null;
    } catch {
      // model returned plain text — use as-is
    }

    // Cache in profile table
    await supabase
      .from("profile")
      .upsert(
        { key: "quote_cache", value: JSON.stringify({ quote, author, date: today }) },
        { onConflict: "key" }
      );

    return NextResponse.json({ quote, author });
  } catch (err) {
    console.error("[daily-quote] error:", err);
    return NextResponse.json({ quote: null, error: "Failed to generate quote" });
  }
}
