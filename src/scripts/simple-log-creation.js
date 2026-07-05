const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function createSimpleLog() {
  try {
    console.log('Starting log creation...');

    // Get the repository
    const repo = await prisma.repository.findFirst({
      where: { githubId: 1152079996 }
    });

    if (!repo) {
      console.log('Repository not found');
      return;
    }

    console.log(`Found repository: ${repo.owner}/${repo.name} (ID: ${repo.id})`);

    // Create a simple log
    const log = await prisma.botActionLog.create({
      data: {
        repositoryId: repo.id,
        deliveryId: 'test-delivery-id',
        eventType: 'issues.opened',
        title: 'Test Issue',
        author: 'test-author',
        url: 'https://github.com/test/repo/issues/1',
        status: 'success',
        actionsTaken: JSON.stringify(['Test action']),
        errorDetails: null,
        aiSummary: null,
        aiPriority: null,
        aiSentiment: null,
      },
    });

    console.log('✅ Log created successfully:', log.id);

    // Check if the log was created
    const logs = await prisma.botActionLog.findMany({
      where: { repositoryId: repo.id }
    });

    console.log(`Found ${logs.length} logs for repository`);

    if (logs.length > 0) {
      console.log('First log:', logs[0]);
    }
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    console.log('Disconnecting from database...');
    await prisma.$disconnect();
    console.log('Script completed');
  }
}

createSimpleLog();
