import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { todayString } from "@/lib/timezone";

const CACHE_KEY = "fun_fact_cache";

interface FunFactCache {
  fact: string;
  date: string;
}

export async function GET() {
  try {
    const supabase = createServiceClient();
    const today = todayString();

    // Check cache
    const { data: cached } = await supabase
      .from("profile")
      .select("value")
      .eq("key", CACHE_KEY)
      .maybeSingle();

    if (cached?.value) {
      const parsed = JSON.parse(cached.value) as FunFactCache;
      if (parsed.date === today) {
        return NextResponse.json({ fact: parsed.fact });
      }
    }

    // Generate new fact
    const { text } = await generateText({
      model: anthropic("claude-haiku-4-5-20251001"),
      maxTokens: 150,
      prompt:
        "Give me one genuinely interesting and surprising fact. Pick randomly from: science, history, space, nature, psychology, technology. Return just the fact as a single sentence or two. No intro like 'Did you know'. Just the fact.",
    });

    const fact = text.trim();

    // Upsert into profile cache
    await supabase
      .from("profile")
      .upsert(
        { key: CACHE_KEY, value: JSON.stringify({ fact, date: today } satisfies FunFactCache) },
        { onConflict: "key" }
      );

    return NextResponse.json({ fact });
  } catch (err) {
    console.error("[fun-fact] error:", err);
    return NextResponse.json({ fact: null, error: "Failed to generate fun fact" });
  }
}
