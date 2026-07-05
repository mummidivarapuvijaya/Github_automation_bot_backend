const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function autoCreateLogsOnStart() {
  try {
    console.log('🔄 Checking for existing issues that need logs...');

    // Get all repositories
    const repositories = await prisma.repository.findMany({
      include: { user: true }
    });

    console.log(`Found ${repositories.length} repositories`);

    for (const repo of repositories) {
      console.log(`\n🔍 Checking repository: ${repo.owner}/${repo.name}`);

      // Check if there are any issues without logs
      const existingLogs = await prisma.botActionLog.findMany({
        where: { repositoryId: repo.id }
      });

      console.log(`Found ${existingLogs.length} existing logs for this repository`);

      if (existingLogs.length === 0) {
        console.log(`📝 No logs found for repository ${repo.owner}/${repo.name}. Creating initial log...`);

        try {
          await prisma.botActionLog.create({
            data: {
              repositoryId: repo.id,
              deliveryId: 'initial-log',
              eventType: 'system.initialized',
              title: 'Repository connected',
              author: 'system',
              url: `https://github.com/${repo.owner}/${repo.name}`,
              status: 'success',
              actionsTaken: JSON.stringify(['Repository connected to the bot']),
              errorDetails: null,
              aiSummary: null,
              aiPriority: null,
              aiSentiment: null,
            },
          });

          console.log(`✅ Created initial log for repository ${repo.owner}/${repo.name}`);
        } catch (logError) {
          console.error(`❌ Failed to create initial log for repository ${repo.owner}/${repo.name}:`, logError);
        }
      } else {
        console.log(`✅ Logs already exist for repository ${repo.owner}/${repo.name}`);
      }
    }

    console.log('\n✅ Finished checking all repositories');
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Export the function so it can be called from other files
module.exports = { autoCreateLogsOnStart };
