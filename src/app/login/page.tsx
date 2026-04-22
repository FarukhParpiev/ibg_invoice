import { Suspense } from "react";
import LoginForm from "./LoginForm";

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="w-full max-w-sm bg-white dark:bg-zinc-950 border rounded-lg p-8 shadow-sm">
        <h1 className="text-2xl font-semibold mb-6">Вход в IBG Invoice</h1>
        <Suspense
          fallback={
            <div className="h-48 flex items-center justify-center text-zinc-400">
              Загрузка…
            </div>
          }
        >
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
