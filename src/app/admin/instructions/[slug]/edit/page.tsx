import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/auth-helpers";
import { InstructionForm } from "../../InstructionForm";
import { updateInstruction, deleteInstruction } from "../../actions";

export default async function EditInstructionPage(
  props: PageProps<"/admin/instructions/[slug]/edit">,
) {
  await requireSuperAdmin();
  const { slug } = await props.params;

  const it = await prisma.instruction.findUnique({ where: { slug } });
  if (!it) notFound();

  // Bind the id into the action so the client form can stay agnostic of it.
  async function handleUpdate(fd: FormData) {
    "use server";
    const res = await updateInstruction(it!.id, fd);
    if (res && res.ok === false) return res;
  }
  async function handleDelete() {
    "use server";
    await deleteInstruction(it!.id);
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
        <h1 className="text-2xl font-semibold mt-2">Edit article</h1>
      </div>
      <InstructionForm
        mode={{
          kind: "edit",
          id: it.id,
          initial: {
            title: it.title,
            bodyMd: it.bodyMd,
            position: it.position,
            slug: it.slug,
          },
        }}
        action={handleUpdate}
        onDelete={handleDelete}
      />
    </div>
  );
}
