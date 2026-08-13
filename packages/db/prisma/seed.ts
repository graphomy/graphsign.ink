import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_CORE_ROLES = [
  { id: 'super_admin', name: 'Super Admin', description: 'Platform super administrator' },
  { id: 'org_admin', name: 'Organisation Admin', description: 'Organisation administrator' },
  { id: 'sender', name: 'Sender / Author', description: 'Document author and sender' },
  { id: 'approver', name: 'Approver', description: 'Document approver' },
  { id: 'reviewer', name: 'Reviewer', description: 'Document reviewer' },
  { id: 'signer', name: 'Signer', description: 'Document signer' },
  { id: 'auditor', name: 'Auditor', description: 'Compliance auditor' },
];

async function main() {
  console.log('Seeding default core roles (FR-003.001 / INK-61)...');

  for (const role of DEFAULT_CORE_ROLES) {
    await prisma.customRole.upsert({
      where: { id: role.id },
      update: { name: role.name, description: role.description },
      create: {
        id: role.id,
        name: role.name,
        description: role.description,
        permissions: ['*'],
      },
    });
  }

  // Ensure super_admin seed users from SUPERADMIN_ID env var (INK-206)
  const superAdminIds = (process.env.SUPERADMIN_ID || 'kunal@graphomy.com')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);

  for (const superAdminEmail of superAdminIds) {
    const existingUser = await prisma.user.findFirst({ where: { email: superAdminEmail } });

    if (existingUser) {
      await prisma.user.update({
        where: { id: existingUser.id },
        data: { role: 'super_admin' },
      });
      console.log(`Updated user ${superAdminEmail} to super_admin role.`);
    }
  }

  console.log('Seeding completed successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
