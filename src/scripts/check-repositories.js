const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkRepositories() {
  try {
    // Get all repositories
    const repositories = await prisma.repository.findMany();

    console.log(`Found ${repositories.length} repositories:`);

    if (repositories.length === 0) {
      console.log('No repositories found in the database.');
      return;
    }

    for (const repo of repositories) {
      console.log(`- ${repo.owner}/${repo.name} (ID: ${repo.id}, userId: ${repo.userId || 'null'}, githubId: ${repo.githubId})`);
    }
  } catch (error) {
    console.error('❌ Error checking repositories:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkRepositories();
