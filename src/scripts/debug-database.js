const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function debugDatabase() {
  try {
    // Get all repositories
    const repositories = await prisma.repository.findMany();
    console.log(`Found ${repositories.length} repositories:`);

    for (const repo of repositories) {
      console.log(`- ${repo.owner}/${repo.name} (ID: ${repo.id}, userId: ${repo.userId}, githubId: ${repo.githubId})`);
    }

    // Get all users
    const users = await prisma.user.findMany();
    console.log(`\nFound ${users.length} users:`);

    for (const user of users) {
      console.log(`- ${user.username} (ID: ${user.id}, githubId: ${user.githubId})`);
    }

    // Get all logs
    const logs = await prisma.botActionLog.findMany();
    console.log(`\nFound ${logs.length} logs:`);

    for (const log of logs) {
      console.log(`- ${log.eventType} for ${log.repositoryId} (ID: ${log.id})`);
    }
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

debugDatabase();
