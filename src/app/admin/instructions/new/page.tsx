import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth-helpers";
import { InstructionForm } from "../InstructionForm";
import { createInstruction } from "../actions";

export default async function NewInstructionPage() {
  await requireSuperAdmin();

  // Wrap the action so the form gets a thin Promise<void | error> shape.
  // Server actions returning `redirect()` throw a routing signal that we
  // must let bubble up — hence the bare `await action(fd)` pattern below.
  async function handleCreate(fd: FormData) {
    "use server";
    const res = await createInstruction(fd);
    if (res && res.ok === false) return res;
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <Link
          href="/admin/instructions"
          className="text-sm text-zinc-500 hover:text-zinc-900"
        >
          ← Back to instructions
        </Link>
        <h1 className="text-2xl font-semibold mt-2">New article</h1>
      </div>
      <InstructionForm mode={{ kind: "create" }} action={handleCreate} />
    </div>
  );
}
