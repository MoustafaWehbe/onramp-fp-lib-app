import { getPrisma } from "../db/prisma";
import { hashPassword } from "../auth/password";

// Seeds a default admin user. Idempotent via upsert, so it is safe to run
// repeatedly against an existing database.
async function main() {
  const prisma = getPrisma();

  // Never commit a real credential. Take the admin password from the
  // environment; fall back to an obvious placeholder for local seeding only,
  // and warn loudly so the default is never relied on silently.
  const fallbackPassword = "ChangeMe123!";
  const adminPassword = process.env.ADMIN_PASSWORD ?? fallbackPassword;
  if (!process.env.ADMIN_PASSWORD) {
    console.warn(
      "[seed] ADMIN_PASSWORD is not set — seeding the admin with an insecure " +
        "default. Set ADMIN_PASSWORD to override it.",
    );
  }
  const passwordHash = await hashPassword(adminPassword);

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
