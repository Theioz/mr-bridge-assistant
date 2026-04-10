"use client";

import { createClient } from "@/lib/supabase/client";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

type State = "idle" | "loading" | "sent" | "error";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>("idle");
  const searchParams = useSearchParams();
  const hasAuthError = searchParams.get("error") === "auth_error";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState("loading");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setState("error");
    } else {
      setState("sent");
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-100">Mr. Bridge</h1>
          <p className="mt-1 text-sm text-neutral-500">Personal assistant</p>
        </div>

        {hasAuthError && (
          <div className="rounded-lg bg-red-950 border border-red-800 px-4 py-3 text-sm text-red-300">
            Magic link expired or invalid. Try again.
          </div>
        )}

        {state === "sent" ? (
          <div className="rounded-lg bg-neutral-900 border border-neutral-700 px-4 py-6 text-center space-y-2">
            <p className="text-neutral-100 font-medium">Check your email</p>
            <p className="text-sm text-neutral-400">
              Sent a magic link to <span className="text-neutral-200">{email}</span>
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm text-neutral-400 mb-1.5">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-4 py-2.5 text-sm text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-neutral-500"
              />
            </div>

            {state === "error" && (
              <p className="text-sm text-red-400">Something went wrong. Try again.</p>
            )}

            <button
              type="submit"
              disabled={state === "loading" || !email.trim()}
              className="w-full bg-neutral-100 text-neutral-950 rounded-lg px-4 py-2.5 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white transition-colors"
            >
              {state === "loading" ? "Sending..." : "Send magic link"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
