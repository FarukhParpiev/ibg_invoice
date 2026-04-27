// One-shot seed for the Instructions FAQ. Idempotent: skips slugs that
// already exist. Run via `npx tsx prisma/seed-instructions.ts`.
//
// The articles are written for the working role (regular `user` accounts)
// and reflect the actual flows in this codebase as of April 2026:
// templates, currencies, VAT/WHT, archive, manual number override, etc.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Article = {
  slug: string;
  title: string;
  bodyMd: string;
  position: number;
};

const articles: Article[] = [
  {
    slug: "getting-started",
    position: 1,
    title: "Getting started",
    bodyMd: `# Welcome to IBG Invoice

This is the internal invoice & receipt system for our nine entities (IBG, IB Group, Wise, crypto, IBG Kas, etc.). It generates branded PDFs, tracks payments, and produces receipts on demand.

## What lives where

- **Invoices** — main list of all current invoices and the receipts they spawned. Drafts, issued, paid, cancelled.
- **Archive** — invoices you wanted out of the main list but want to keep around. Restore at any time.
- **Receipts** — auto-generated when you mark an invoice as paid. Numbered as the parent invoice + "-R".
- **Counterparties** — the directory of clients you bill. Quick-add from inside the invoice form is fine.
- **Our companies** (super-admin only) — the nine legal entities and their bank accounts.
- **Users** (super-admin only) — who can log in.

## The lifecycle of an invoice

1. **Create** — fills in template, dates, items. Status: \`draft\`. No number yet.
2. **Issue** — locks in a number (\`DD/MM/YYYY-NNNN\`) and an exchange rate. Status: \`issued\`.
3. **Mark as paid** — records payment date and auto-generates a receipt PDF. Status: \`paid\`.
4. (Optional) **Cancel** with a reason — overlays a "CANCELLED" banner on the PDF.
5. (Optional) **Archive** when it stops being relevant day-to-day. Restorable.
`,
  },
  {
    slug: "how-to-create-an-invoice",
    position: 2,
    title: "How to create an invoice",
    bodyMd: `# How to create an invoice

1. Open **Invoices** → **+ New invoice** in the top-right.
2. Pick a **template** — this drives which company, bank account and currency get pre-filled. Available options:
   - \`IBG THB\` / \`IB Group THB\` — Thai resident entities, default THB.
   - \`IB Group USD\` — offshore, USD.
   - \`Wise THB\` / \`Crypto\` / \`IBG Kas\` — alternate payout rails.
   - \`Blank\` — fully manual: pick company, bank, currency yourself.
3. Pick a **counterparty**. Don't see them in the dropdown? Click **+ Quick add** to create one inline (name, Tax ID, address — the rest can be filled later).
4. Set **Issue date** and (optionally) **Due date**.
5. Add **line items**. Three flavours:
   - **Commission** — selling price × % + corrections. Useful for property deals.
   - **Bonus** — flat amount.
   - **Other** — free-form, write the description in *Project* and amount in *Other amount*.
6. Tweak the toggles if needed: **VAT 7%**, **VAT included in amount**, **WHT 3%**, **Show USD equivalent**.
7. Click **Save draft**. The invoice now exists with status \`draft\`.

> **Heads up.** Drafts have **no number yet** — that's by design. The number is locked in at issuance so the sequence stays gap-free.
`,
  },
  {
    slug: "how-to-edit-or-duplicate",
    position: 3,
    title: "How to edit or duplicate an invoice",
    bodyMd: `# How to edit or duplicate an invoice

## Editing
- **Drafts** can be freely edited. Open the draft → **Edit**.
- **Issued / paid / cancelled** invoices are **locked**. The number, totals, and exchange rate are part of the audit trail.
  - Need a fix? Cancel the old invoice and create a new one (or duplicate it as a starting point — see below).

## Duplicating
On any non-draft invoice the detail page shows a **Duplicate** button. It copies:

- the template, our company, bank, counterparty, currency
- VAT / WHT toggles
- all line items and amounts

It does **not** copy the number, dates (issue date defaults to today), exchange rate, or PDF — those are fresh for the new invoice.

The duplicate lands as a \`draft\` so you can adjust before issuing.
`,
  },
  {
    slug: "how-to-issue-an-invoice",
    position: 4,
    title: "How to issue an invoice",
    bodyMd: `# How to issue an invoice

Issuing is the step that turns a draft into a real, numbered, locked invoice with a polished PDF. It's the **black "Issue" button** on the draft detail page — *not* "Generate PDF".

## What happens on Issue

1. The system allocates the next serial number from a global counter.
2. The number \`DD/MM/YYYY-NNNN\` is built from the issue date + serial.
3. Today's exchange rate is fetched and **frozen** on the invoice (USD-equivalent invoices only).
4. Status flips to \`issued\`.
5. The branded PDF is generated and uploaded to permanent public storage.

## Custom number (override)

In the **Advanced** section you can set a **manual number override** *before* issuing — e.g. \`23/04/2026-0001\` for migrating a legacy invoice. When you Issue, the override is used as-is and \`numberOverride\` is then cleared. The system still allocates the next serial in the background so the auto-sequence keeps marching forward.

## What if Issue fails?

- A "race" on the serial number triggers up to 3 automatic retries.
- A PDF generation error doesn't block issuance — the invoice is already issued, you'll see a yellow note. Click **Regenerate PDF** to retry.

## "Generate PDF" vs "Issue" — which do I press?

> **Issue first, then generate.** "Generate PDF" on a draft only makes a *preview* with a \`-draft.pdf\` filename and no number. It's harmless but it does **not** publish the invoice.
`,
  },
  {
    slug: "how-to-mark-as-paid",
    position: 5,
    title: "How to mark an invoice as paid (+ receipt)",
    bodyMd: `# How to mark an invoice as paid

When you receive payment, open the **issued** invoice and click the green **Mark as paid (+ receipt)** button.

You'll be asked for the **payment date** (defaults to today). The system will:

1. Set status to \`paid\` and record \`paidAt\`.
2. Auto-create a **receipt** invoice as a child of this one.
3. Number the receipt as parent number + \`-R\` (e.g. \`23/04/2026-0004-R\`).
4. Generate both PDFs (parent + receipt).

The receipt shows up in **Receipts** in the sidebar. You can link to it from CRM directly via **Copy public link**.

> **Note.** A receipt is *not* an invoice — it cannot be edited, cancelled, or paid again. It changes only when the parent invoice changes (e.g. cancelled).
`,
  },
  {
    slug: "how-to-cancel-an-invoice",
    position: 6,
    title: "How to cancel an invoice",
    bodyMd: `# How to cancel an invoice

Open the **issued** invoice → **Cancel**. A small dialog asks for a **reason** (visible to internal users only).

Effects:

- Status: \`cancelled\`.
- The PDF is regenerated with a red **CANCELLED** stamp at the top.
- The invoice still exists for accounting / audit; the number is **not** released.

A **paid** invoice cannot be cancelled — refund externally and create a new credit invoice instead.

A **cancelled** invoice can be archived from the bulk-action bar on the main list.
`,
  },
  {
    slug: "how-to-archive-and-delete",
    position: 7,
    title: "Archive vs. permanent delete",
    bodyMd: `# Archive vs. permanent delete

Two destructive paths, only one is reversible.

## Drafts

A draft never had a number, so deleting it leaves no audit gap. From the invoices list:

1. Tick the checkbox(es) on the rows you want to delete.
2. Click **Delete drafts** in the action bar at the bottom.
3. Confirm the prompt.

Deletion is permanent.

## Issued / paid / cancelled invoices → Archive

Issued invoices keep their number and audit trail forever, but you don't always want them in your main list.

1. Tick the rows.
2. Click **Archive** in the action bar.
3. They disappear from the main list and show up in **Archive** in the sidebar.

From **Archive** you can:

- **Restore** — moves them back into the main list.
- **Delete permanently** — irreversibly removes the row + line items. The PDF blob stays but is now orphaned. Confirm twice.

> **Important.** Permanent delete refuses to delete an invoice that still has linked receipts. Delete (or archive) the receipt first.
`,
  },
  {
    slug: "how-to-add-a-counterparty",
    position: 8,
    title: "How to add a counterparty",
    bodyMd: `# How to add a counterparty

Two paths — pick whichever fits the moment.

## From the invoice form (quick add)

When you can't find them in the **Counterparty** dropdown:

1. Click **+ Quick add**.
2. Fill in **Name**, **Tax ID** (optional), **Address** (optional).
3. Save — they're selected immediately on the current invoice and added to the directory.

## From the directory

For full editing (e-mail, language preference, notes):

1. **Counterparties** in the sidebar → **+ New counterparty**.
2. Fill in the form. \`Preferred language\` controls which language the PDF uses for that counterparty (English vs. Thai).
3. Save.

## Search & pagination

- **Counterparties** has live search (debounced).
- The list paginates 50 per page; navigate with **Prev / Next** at the bottom.
- The **Show all / Active only** toggle includes/hides soft-deleted counterparties.

## Editing or hiding a counterparty

Click **Edit →** on the row. From the edit page:

- Change any field.
- **Hide** (soft delete) — the counterparty disappears from the picker but existing invoices keep working.
- **Delete** — only allowed if the counterparty has no invoices.
`,
  },
  {
    slug: "search-and-shortcuts",
    position: 9,
    title: "Search & shortcuts",
    bodyMd: `# Search & shortcuts

## Where search works

- **Invoices** — by number, our company, counterparty, project name, unit code. Status & type filters can be combined with search.
- **Receipts** — by number, company, counterparty.
- **Counterparties** — by name, e-mail, Tax ID.
- **Archive** — same fields as invoices, scoped to archived rows.

Search is **case-insensitive** and matches partial strings (\`23/04\` finds all April 23 invoices).

## Useful URL tricks

- \`/admin/invoices?status=draft\` — only drafts.
- \`/admin/invoices?type=receipt\` — only receipts.
- \`/admin/invoices/archive?q=John\` — search inside the archive.
- \`/admin/instructions#how-to-issue-an-invoice\` — deep-link to a specific FAQ article (auto-expands).

## Sharing a PDF

- Click an invoice → **Copy public link**. The URL is permanent, public, unguessable, and CRM-ready.
- The auth-gated **Download PDF** button gives the same file but with a clean \`{Project} {Unit}.pdf\` filename for your local copy.
`,
  },
];

async function main() {
  console.log(`Seeding ${articles.length} instructions…`);
  let created = 0;
  let skipped = 0;
  for (const a of articles) {
    const exists = await prisma.instruction.findUnique({
      where: { slug: a.slug },
      select: { id: true },
    });
    if (exists) {
      skipped++;
      console.log(`  · skip ${a.slug} (already present)`);
      continue;
    }
    await prisma.instruction.create({ data: a });
    created++;
    console.log(`  + ${a.slug}`);
  }
  console.log(`Done. created=${created} skipped=${skipped}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
