const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function updateRepository() {
  try {
    // Get the user (assuming there's only one user)
    const user = await prisma.user.findFirst();

    if (!user) {
      console.log('No user found in the database.');
      return;
    }

    console.log(`Found user: ${user.username} (ID: ${user.id})`);

    // Get the repository without userId
    const repo = await prisma.repository.findFirst({
      where: { userId: null }
    });

    if (!repo) {
      console.log('No repository without userId found.');
      return;
    }

    console.log(`Found repository: ${repo.owner}/${repo.name} (ID: ${repo.id})`);

    // Update the repository with userId
    await prisma.repository.update({
      where: { id: repo.id },
      data: { userId: user.id }
    });

    console.log(`✅ Updated repository ${repo.owner}/${repo.name} with userId ${user.id}`);
  } catch (error) {
    console.error('❌ Error updating repository:', error);
  } finally {
    await prisma.$disconnect();
  }
}

updateRepository();
