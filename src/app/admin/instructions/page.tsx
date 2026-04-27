import Link from "next/link";
import { marked } from "marked";
import { prisma } from "@/lib/prisma";
import { requireAdminAccess } from "@/lib/auth-helpers";

// Public read-only FAQ for the admin panel. Any logged-in user can read;
// only super_admin sees the "+ New" / "Edit" / "Delete" buttons.
//
// Layout: a sidebar with the title list and a main column with all articles
// rendered as <details> blocks. Each block has a stable `id` matching the
// slug so deep links (#how-to-issue-an-invoice) jump straight to the article
// and auto-expand it via the :target CSS pseudo-class.

export default async function InstructionsPage(
  props: PageProps<"/admin/instructions">,
) {
  const session = await requireAdminAccess();
  const isSuperAdmin = session.user.role === "super_admin";
  const sp = await props.searchParams;
  const flashDeleted = sp.deleted === "1";

  const instructions = await prisma.instruction.findMany({
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      slug: true,
      title: true,
      bodyMd: true,
      updatedAt: true,
      author: { select: { name: true, email: true } },
    },
  });

  // GFM gives us tables, autolinks, and task lists out of the box. The
  // `breaks` option matches what people instinctively type in a textarea.
  marked.setOptions({ gfm: true, breaks: true });

  // Pre-render markdown to HTML so the JSX below can stay synchronous —
  // RSC can technically resolve Promises in children, but a flat array of
  // {…, html} keeps the component tree predictable and easier to diff.
  const articles = instructions.map((it) => ({
    ...it,
    html: marked.parse(it.bodyMd || "") as string,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Instructions</h1>
          <p className="text-sm text-zinc-500 mt-1">
            How-to guides for the invoice system. Click a section to expand.
          </p>
        </div>
        {isSuperAdmin && (
          <Link
            href="/admin/instructions/new"
            className="bg-black text-white rounded px-4 py-2 text-sm hover:bg-zinc-800"
          >
            + New article
          </Link>
        )}
      </div>

      {flashDeleted && (
        <div className="text-sm rounded bg-zinc-100 px-3 py-2">
          Article deleted.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
        {/* TOC sidebar — clicking a title scrolls to the matching <details>
            and the :target pseudo-class auto-opens it (see globals or below). */}
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <div className="border rounded-lg bg-white">
            <div className="text-xs uppercase tracking-wide text-zinc-500 px-3 py-2 border-b">
              Topics
            </div>
            {instructions.length === 0 ? (
              <p className="text-sm text-zinc-500 p-3">
                No articles yet.
                {isSuperAdmin && " Use «+ New article» to add the first one."}
              </p>
            ) : (
              <nav className="flex flex-col text-sm">
                {instructions.map((it) => (
                  <a
                    key={it.id}
                    href={`#${it.slug}`}
                    className="px-3 py-2 hover:bg-zinc-50 border-b last:border-b-0 text-zinc-700"
                  >
                    {it.title}
                  </a>
                ))}
              </nav>
            )}
          </div>
        </aside>

        <main className="space-y-3">
          {articles.length === 0 ? (
            <div className="border rounded-lg p-8 text-center text-zinc-500 bg-white">
              The knowledge base is empty.
              {isSuperAdmin && (
                <>
                  {" "}
                  <Link
                    href="/admin/instructions/new"
                    className="text-blue-600 hover:underline"
                  >
                    Create the first article →
                  </Link>
                </>
              )}
            </div>
          ) : (
            articles.map((it) => (
              <details
                key={it.id}
                id={it.slug}
                className="group border rounded-lg bg-white open:shadow-sm"
              >
                <summary className="cursor-pointer list-none flex items-center justify-between px-4 py-3 hover:bg-zinc-50 rounded-lg">
                  <span className="flex items-center gap-3">
                    <span className="text-zinc-400 group-open:rotate-90 transition-transform">
                      ▶
                    </span>
                    <span className="font-medium">{it.title}</span>
                  </span>
                  <span className="flex items-center gap-3 text-xs text-zinc-400">
                    <span>
                      {it.updatedAt.toISOString().slice(0, 10)}
                      {it.author && ` · ${it.author.name ?? it.author.email}`}
                    </span>
                    {isSuperAdmin && (
                      <Link
                        href={`/admin/instructions/${it.slug}/edit`}
                        className="text-blue-600 hover:underline"
                      >
                        Edit
                      </Link>
                    )}
                  </span>
                </summary>
                <article
                  className="instruction-body px-4 pb-4 text-sm text-zinc-800"
                  // Markdown is authored only by super-admins, so we trust
                  // the HTML it produces. (No untrusted user content here.)
                  dangerouslySetInnerHTML={{ __html: it.html }}
                />
              </details>
            ))
          )}
        </main>
      </div>

      {/* Auto-open the targeted article via CSS — :target is the hash in the
          URL. Without this, deep links would scroll to the right place but
          leave it collapsed. */}
      <style>{`
        details:target { /* purely cosmetic: open via JS-less attr below */ }
      `}</style>
      <script
        // Tiny inline script: open <details> matching window.location.hash.
        // Server-rendered hash routing is unreliable; this fixes it on load.
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: `
            (function(){
              function openHash(){
                var h = location.hash && location.hash.slice(1);
                if(!h) return;
                var el = document.getElementById(h);
                if(el && el.tagName==='DETAILS') el.open = true;
              }
              openHash();
              window.addEventListener('hashchange', openHash);
            })();
          `,
        }}
      />
    </div>
  );
}
