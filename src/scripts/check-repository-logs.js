const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkRepositoryLogs() {
  try {
    // Get the repository
    const repo = await prisma.repository.findFirst({
      where: { githubId: 1152079996 }
    });

    if (!repo) {
      console.log('Repository not found');
      return;
    }

    console.log(`Found repository: ${repo.owner}/${repo.name} (ID: ${repo.id}, userId: ${repo.userId})`);

    // Check if there are any logs for this repository
    const logs = await prisma.botActionLog.findMany({
      where: { repositoryId: repo.id }
    });

    console.log(`\nFound ${logs.length} logs for repository`);

    if (logs.length > 0) {
      console.log('Logs:');
      for (const log of logs) {
        console.log(`- ${log.eventType} (ID: ${log.id})`);
        console.log(`  Title: ${log.title}`);
        console.log(`  Author: ${log.author}`);
        console.log(`  Status: ${log.status}`);
        console.log(`  Created: ${log.createdAt}`);
      }
    }

    // Also check if there are any logs in the database at all
    const allLogs = await prisma.botActionLog.findMany();
    console.log(`\nTotal logs in database: ${allLogs.length}`);

    if (allLogs.length > 0) {
      console.log('All logs:');
      for (const log of allLogs) {
        console.log(`- ${log.eventType} for ${log.repositoryId} (ID: ${log.id})`);
      }
    }
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkRepositoryLogs();
