const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function updateRepositories() {
  try {
    // Get all repositories without a userId
    const repositories = await prisma.repository.findMany({
      where: { userId: null },
      include: { user: true }
    });

    console.log(`Found ${repositories.length} repositories without userId`);

    for (const repo of repositories) {
      console.log(`Updating repository ${repo.owner}/${repo.name} (ID: ${repo.id})`);

      // Update the repository with userId
      await prisma.repository.update({
        where: { id: repo.id },
        data: { userId: repo.user?.id }
      });

      console.log(`✅ Updated repository ${repo.owner}/${repo.name}`);
    }

    console.log('✅ All repositories updated successfully');
  } catch (error) {
    console.error('❌ Error updating repositories:', error);
  } finally {
    await prisma.$disconnect();
  }
}

updateRepositories();
