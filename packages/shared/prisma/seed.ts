import { getPrisma } from "../db/prisma";
import { hashPassword } from "../auth/password";

// Seeds a default admin user. Idempotent via upsert, so it is safe to run
// repeatedly against an existing database.
async function main() {
  const prisma = getPrisma();
  const passwordHash = await hashPassword("Admin1234!");

  await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      email: "admin@example.com",
      passwordHash,
      name: "Admin User",
      role: "admin",
      emailVerified: true,
    },
  });

  console.info("Seeded admin user (admin@example.com)");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await getPrisma().$disconnect();
  });
