"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import Logo from "@/components/ui/logo";

const DEMO_EMAIL = process.env.NEXT_PUBLIC_DEMO_EMAIL ?? "";
const DEMO_PASSWORD = process.env.NEXT_PUBLIC_DEMO_PASSWORD ?? "";

type State = "idle" | "loading" | "error";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<State>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const searchParams = useSearchParams();
  const hasAuthError = searchParams.get("error") === "auth_error";
  const router = useRouter();

  async function signIn(e: string, p: string) {
    setState("loading");
    setErrorMsg("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email: e, password: p });
    if (error) {
      setErrorMsg(error.message);
      setState("error");
    } else {
      router.refresh();
      router.push("/");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await signIn(email, password);
  }

  async function handleDemoLogin() {
    if (!DEMO_EMAIL || !DEMO_PASSWORD) return;
    setEmail(DEMO_EMAIL);
    setPassword(DEMO_PASSWORD);
    await signIn(DEMO_EMAIL, DEMO_PASSWORD);
  }

  return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="flex items-center gap-3">
          <Logo size={36} />
          <div>
            <h1 className="text-2xl font-semibold text-neutral-100">Mr. Bridge</h1>
            <p className="mt-0.5 text-sm text-neutral-500">Personal assistant</p>
          </div>
        </div>

        {hasAuthError && (
          <div className="rounded-lg bg-red-950 border border-red-800 px-4 py-3 text-sm text-red-300">
            Session expired. Please sign in again.
          </div>
        )}

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

          <div>
            <label htmlFor="password" className="block text-sm text-neutral-400 mb-1.5">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-4 py-2.5 text-sm text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-neutral-500"
            />
          </div>

          {state === "error" && (
            <p className="text-sm text-red-400">{errorMsg || "Invalid email or password."}</p>
          )}

          <button
            type="submit"
            disabled={state === "loading" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password.trim()}
            className="w-full bg-blue-500 text-white rounded-lg px-4 py-2.5 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-400 transition-colors"
          >
            {state === "loading" ? "Signing in..." : "Sign in"}
          </button>
        </form>

        {DEMO_EMAIL && DEMO_PASSWORD && (
          <div className="pt-2">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-neutral-800" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-neutral-950 px-3 text-neutral-600">or</span>
              </div>
            </div>
            <button
              onClick={handleDemoLogin}
              disabled={state === "loading"}
              className="mt-4 w-full border border-neutral-700 text-neutral-300 rounded-lg px-4 py-2.5 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:border-neutral-500 hover:text-neutral-100 transition-colors"
            >
              Try the demo
            </button>
            <p className="mt-2 text-center text-xs text-neutral-600">
              Fictional persona · read-write · resets nightly
            </p>
          </div>
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
