const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const prisma = new PrismaClient();

async function createLogComplete() {
  try {
    console.log('Starting log creation...');

    // Get the repository
    const repo = await prisma.repository.findFirst({
      where: { githubId: 1214363163 }
    });

    if (!repo) {
      console.log('Repository not found');
      return;
    }

    console.log(`Found repository: ${repo.owner}/${repo.name} (ID: ${repo.id})`);

    // Create a simple log
    const logData = {
      repositoryId: repo.id,
      deliveryId: crypto.randomBytes(16).toString('hex'),
      eventType: 'issues.opened',
      title: 'login_issue',
      author: 'mummidivarapuvijaya',
      url: 'https://github.com/mummidivarapuvijaya/Educase-frontend/issues/4',
      status: 'success',
      actionsTaken: JSON.stringify(['Issue payload received']),
      errorDetails: null,
      aiSummary: null,
      aiPriority: null,
      aiSentiment: null,
    };

    console.log('Creating log with data:', JSON.stringify(logData, null, 2));

    const log = await prisma.botActionLog.create({
      data: logData,
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
    console.error('Stack trace:', error.stack);
  } finally {
    console.log('Disconnecting from database...');
    await prisma.$disconnect();
    console.log('Script completed');
  }
}

createLogComplete();
