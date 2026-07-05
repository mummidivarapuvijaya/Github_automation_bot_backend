const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkUsers() {
  try {
    // Get all users
    const users = await prisma.user.findMany();

    console.log(`Found ${users.length} users:`);

    if (users.length === 0) {
      console.log('No users found in the database.');
      return;
    }

    for (const user of users) {
      console.log(`- ${user.username} (ID: ${user.id})`);
    }
  } catch (error) {
    console.error('❌ Error checking users:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkUsers();
