import { tool, jsonSchema } from "ai";
import { ok, err } from "./_contract";
import type { ToolContext } from "./_context";

export function buildBacklogTools({ supabase, userId }: ToolContext) {
  return {
    list_backlog: tool({
      description:
        "List items in the user's media backlog. Optionally filter by media type (game/show/movie/book) and/or status (backlog/active/paused/finished/dropped).",
      inputSchema: jsonSchema<{
        media_type?: "game" | "show" | "movie" | "book";
        status?: "backlog" | "active" | "paused" | "finished" | "dropped";
        limit?: number;
      }>({
        type: "object",
        properties: {
          media_type: {
            type: "string",
            enum: ["game", "show", "movie", "book"],
            description: "Filter to a specific media category.",
          },
          status: {
            type: "string",
            enum: ["backlog", "active", "paused", "finished", "dropped"],
            description: "Filter by lifecycle status.",
          },
          limit: {
            type: "number",
            description: "Max items to return. Defaults to 20.",
          },
        },
      }),
      execute: async ({ media_type, status, limit = 20 }) => {
        let q = supabase
          .from("backlog_items")
          .select(
            "id, media_type, title, creator, status, rating, priority, started_at, finished_at",
          )
          .eq("user_id", userId)
          .order("priority", { ascending: true })
          .limit(limit);
        if (media_type) q = q.eq("media_type", media_type);
        if (status) q = q.eq("status", status);
        const { data, error } = await q;
        if (error) return { error: error.message };
        return data ?? [];
      },
    }),

    add_backlog_item: tool({
      description:
        "Add a game, show, movie, or book to the user's backlog. Searches for metadata automatically if title matches a known work. Always confirm the media_type with the user if ambiguous.",
      inputSchema: jsonSchema<{
        media_type: "game" | "show" | "movie" | "book";
        title: string;
        status?: "backlog" | "active" | "paused" | "finished" | "dropped";
        creator?: string;
        rating?: number;
      }>({
        type: "object",
        required: ["media_type", "title"],
        additionalProperties: false,
        properties: {
          media_type: {
            type: "string",
            enum: ["game", "show", "movie", "book"],
            description: "Category of the media item.",
          },
          title: { type: "string", description: "Title of the game, show, movie, or book." },
          status: {
            type: "string",
            enum: ["backlog", "active", "paused", "finished", "dropped"],
            description: "Initial status. Defaults to 'backlog'.",
          },
          creator: {
            type: "string",
            description: "Optional: developer, author, director, or showrunner.",
          },
          rating: {
            type: "number",
            description: "Optional: 0–10 rating (one decimal).",
          },
        },
      }),
      execute: async ({ media_type, title, status = "backlog", creator, rating }) => {
        // Compute priority = max+1 within (user_id, media_type)
        const { data: maxRow } = await supabase
          .from("backlog_items")
          .select("priority")
          .eq("user_id", userId)
          .eq("media_type", media_type)
          .order("priority", { ascending: false })
          .limit(1)
          .maybeSingle();

        const priority = (maxRow?.priority ?? -1) + 1;

        const { data, error } = await supabase
          .from("backlog_items")
          .insert({
            user_id: userId,
            media_type,
            title,
            creator: creator ?? null,
            status,
            priority,
            rating: rating != null ? Math.round(rating * 10) / 10 : null,
            external_source: "manual",
          })
          .select("id, media_type, title, creator, status, priority, rating")
          .single();

        if (error) return err(error.message);
        if (!data) return err("Insert returned no row.");
        return ok({ item: data });
      },
    }),

    update_backlog_item: tool({
      description:
        "Update a backlog item's status, rating, or review by its ID. Use list_backlog first to find the ID if you don't have it.",
      inputSchema: jsonSchema<{
        id: string;
        status?: "backlog" | "active" | "paused" | "finished" | "dropped";
        rating?: number;
        review?: string;
        started_at?: string;
        finished_at?: string;
      }>({
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string", description: "UUID of the backlog item." },
          status: {
            type: "string",
            enum: ["backlog", "active", "paused", "finished", "dropped"],
          },
          rating: { type: "number", description: "0–10 rating." },
          review: { type: "string", description: "Free-form review text." },
          started_at: { type: "string", description: "ISO date string for when you started." },
          finished_at: { type: "string", description: "ISO date string for when you finished." },
        },
      }),
      execute: async ({ id, status, rating, review, started_at, finished_at }) => {
        const patch: Record<string, unknown> = {};
        if (status !== undefined) patch.status = status;
        if (rating !== undefined) patch.rating = Math.round(rating * 10) / 10;
        if (review !== undefined) patch.review = review;
        if (started_at !== undefined) patch.started_at = started_at;
        if (finished_at !== undefined) patch.finished_at = finished_at;

        if (Object.keys(patch).length === 0) return err("No fields to update.");

        const { data, error } = await supabase
          .from("backlog_items")
          .update(patch)
          .eq("id", id)
          .eq("user_id", userId)
          .select("id, title, status, rating, review, started_at, finished_at")
          .maybeSingle();

        if (error) return err(error.message);
        if (!data) return err(`No backlog item found with id ${id}.`);
        return ok({ item: data });
      },
    }),

    log_backlog_session: tool({
      description:
        "Log a play/watch/read session for a backlog item. Use list_backlog to find the item ID first.",
      inputSchema: jsonSchema<{
        item_id: string;
        started_at?: string;
        finished_at?: string;
        notes?: string;
      }>({
        type: "object",
        required: ["item_id"],
        properties: {
          item_id: { type: "string", description: "UUID of the backlog item." },
          started_at: { type: "string", description: "ISO date string for session start." },
          finished_at: { type: "string", description: "ISO date string for session finish." },
          notes: {
            type: "string",
            description: "Per-session notes (e.g. 'second playthrough on Nightmare').",
          },
        },
      }),
      execute: async ({ item_id, started_at, finished_at, notes }) => {
        // Verify item belongs to user
        const { data: item } = await supabase
          .from("backlog_items")
          .select("id, title")
          .eq("id", item_id)
          .eq("user_id", userId)
          .maybeSingle();
        if (!item) return err(`No backlog item found with id ${item_id}.`);

        const { data, error } = await supabase
          .from("backlog_sessions")
          .insert({
            item_id,
            user_id: userId,
            started_at: started_at ?? null,
            finished_at: finished_at ?? null,
            notes: notes ?? null,
          })
          .select("id, item_id, started_at, finished_at, notes")
          .single();

        if (error) return err(error.message);
        if (!data) return err("Insert returned no row.");
        return ok({ session: data, item_title: item.title });
      },
    }),
  };
}
