import Link from "next/link";
import { auth } from "@/auth";

export default async function HomePage() {
  const session = await auth();

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 gap-8">
      <div className="text-center space-y-3">
        <h1 className="text-4xl font-semibold">IBG Invoice</h1>
        <p className="text-zinc-500 max-w-md">
          Веб-приложение для генерации инвойсов по комиссионным выплатам.
        </p>
      </div>

      {session?.user ? (
        <div className="flex flex-col items-center gap-3">
          <p className="text-zinc-700">
            Вы вошли как <strong>{session.user.email}</strong>{" "}
            <span className="text-xs uppercase px-2 py-0.5 rounded bg-zinc-100">
              {session.user.role}
            </span>
          </p>
          <div className="flex gap-3">
            <Link
              href="/admin"
              className="px-4 py-2 rounded bg-black text-white hover:bg-zinc-800"
            >
              Перейти в админку
            </Link>
            <Link
              href="/api/auth/signout"
              className="px-4 py-2 rounded border hover:bg-zinc-50"
            >
              Выйти
            </Link>
          </div>
        </div>
      ) : (
        <Link
          href="/login"
          className="px-6 py-3 rounded-full bg-black text-white hover:bg-zinc-800"
        >
          Войти
        </Link>
      )}

      <footer className="absolute bottom-6 text-xs text-zinc-400">
        v0.1.0 · MVP in progress
      </footer>
    </main>
  );
}
