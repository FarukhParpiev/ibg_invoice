import { Suspense } from "react";
import LoginForm from "./LoginForm";

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="w-full max-w-sm bg-white dark:bg-zinc-950 border rounded-lg p-8 shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logos/ibg.png"
          alt="IBG Invoice"
          className="h-12 mx-auto mb-6"
        />
        <h1 className="text-2xl font-semibold mb-6 text-center">
          Sign in to IBG Invoice
        </h1>
        <Suspense
          fallback={
            <div className="h-48 flex items-center justify-center text-zinc-400">
              Loading…
            </div>
          }
        >
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
