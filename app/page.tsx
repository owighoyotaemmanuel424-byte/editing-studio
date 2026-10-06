"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import Editor from "./editor";

function ConvexSetupNotice() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--bg)] p-6">
      <section className="w-full max-w-md rounded-3xl border border-[var(--line)] bg-[var(--panel)] p-6 text-center">
        <div className="text-lg font-bold">NewsCut</div>
        <div className="mt-2 text-sm text-[var(--muted)]">
          Convex is not configured for this deployment yet.
        </div>
        <div className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--panel2)] p-4 text-left">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">
            Required environment variable
          </div>
          <code className="mt-2 block break-all text-xs">
            NEXT_PUBLIC_CONVEX_URL
          </code>
        </div>
      </section>
    </main>
  );
}

export default function Home() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;

  if (!url) {
    return <ConvexSetupNotice />;
  }

  const client = new ConvexReactClient(url);

  return (
    <ConvexProvider client={client}>
      <Editor />
    </ConvexProvider>
  );
}
