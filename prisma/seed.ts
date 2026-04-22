// Seed-скрипт: инициализация БД.
// Запуск: npx tsx prisma/seed.ts
// Идемпотентный — можно запускать повторно.

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { seedCompanies } from "./seed/companies";

const prisma = new PrismaClient();

async function seedPaymentTerms() {
  const terms = [
    { code: "BANK_TRANSFER", label: "Bank Transfer" },
    { code: "SWIFT_TRANSFER", label: "SWIFT Transfer" },
    { code: "CRYPTO_TRANSFER", label: "Crypto Transfer" },
  ];
  for (const t of terms) {
    await prisma.paymentTerms.upsert({
      where: { code: t.code },
      update: { label: t.label, isActive: true },
      create: t,
    });
  }
  console.log(`✓ Payment terms: ${terms.length}`);
}

async function seedSuperAdmin() {
  const email = process.env.SUPER_ADMIN_EMAIL;
  const password = process.env.SUPER_ADMIN_PASSWORD;

  if (!email || !password) {
    console.log("⚠ SUPER_ADMIN_EMAIL/PASSWORD не заданы — супер-админ не создан");
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.upsert({
    where: { email },
    update: { role: "super_admin", isActive: true },
    create: {
      email,
      name: "Super Admin",
      passwordHash,
      role: "super_admin",
      isActive: true,
    },
  });
  console.log(`✓ Super admin: ${email}`);
}

async function seedOurCompanies() {
  for (const c of seedCompanies) {
    const existing = await prisma.company.findFirst({
      where: { name: c.name },
    });

    if (existing) {
      console.log(`  skip: ${c.name} (уже существует)`);
      continue;
    }

    await prisma.company.create({
      data: {
        name: c.name,
        legalType: c.legalType,
        address: c.address,
        taxId: c.taxId,
        registrationNo: c.registrationNo,
        phone: c.phone,
        email: c.email,
        defaultCurrency: c.defaultCurrency,
        bankAccounts: {
          create: c.bankAccounts,
        },
      },
    });
    console.log(`  ✓ ${c.name}`);
  }
  console.log(`✓ Our companies: ${seedCompanies.length}`);
}

async function main() {
  console.log("🌱 Seeding database…\n");
  await seedPaymentTerms();
  await seedSuperAdmin();
  await seedOurCompanies();
  console.log("\n✅ Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
