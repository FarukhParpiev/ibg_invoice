// Импорт контрагентов из prisma/seed/counterparties.ts в БД.
// Идемпотентный: если контрагент с таким же name уже есть — пропускаем.
// Запуск:
//   npx tsx prisma/seed-counterparties.ts
// Для prod:
//   DATABASE_URL=... DATABASE_URL_UNPOOLED=... npx tsx prisma/seed-counterparties.ts

import { PrismaClient } from "@prisma/client";
import { seedCounterparties } from "./seed/counterparties";

const prisma = new PrismaClient();

async function main() {
  console.log(`🌱 Импорт контрагентов: ${seedCounterparties.length} строк\n`);
  let created = 0;
  let skipped = 0;

  for (const cp of seedCounterparties) {
    const existing = await prisma.counterparty.findFirst({
      where: { name: cp.name },
    });

    if (existing) {
      skipped += 1;
      console.log(`  skip: ${cp.name}`);
      continue;
    }

    await prisma.counterparty.create({ data: cp });
    created += 1;
    console.log(`  ✓ ${cp.name}`);
  }

  console.log(`\n✅ Создано: ${created}, пропущено: ${skipped}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
