const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const prisma = new PrismaClient();

async function createManualLogs() {
  try {
    // Get the repository
    const repo = await prisma.repository.findFirst({
      where: { githubId: 1214363163 }
    });

    if (!repo) {
      console.log('Repository not found');
      return;
    }

    console.log(`Found repository: ${repo.owner}/${repo.name} (ID: ${repo.id})`);

    // Create a log for the existing issue
    const deliveryId = crypto.randomBytes(16).toString('hex');

    try {
      await createBotLog({
        repositoryId: repo.id,
        deliveryId,
        eventType: 'issues.opened',
        title: 'login_issue',
        author: 'mummidivarapuvijaya',
        url: 'https://github.com/mummidivarapuvijaya/Educase-frontend/issues/4',
        status: 'success',
        actionsTaken: ['Issue payload received'],
        errorDetails: null,
        aiSummary: null,
        aiPriority: null,
        aiSentiment: null,
      });

      console.log(`✅ Created log for issue`);
    } catch (logError) {
      console.error(`❌ Failed to create log:`, logError);
    }

    console.log('\n✅ Finished processing');
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Helper function to create bot log
async function createBotLog(params) {
  const {
    repositoryId,
    deliveryId,
    eventType,
    title,
    author,
    url,
    status,
    actionsTaken = [],
    errorDetails = null,
    aiSummary = null,
    aiPriority = null,
    aiSentiment = null,
  } = params;

  await prisma.botActionLog.create({
    data: {
      repositoryId,
      deliveryId,
      eventType,
      title,
      author,
      url,
      status,
      actionsTaken: JSON.stringify(actionsTaken.length ? actionsTaken : ['No actions triggered']),
      errorDetails,
      aiSummary,
      aiPriority,
      aiSentiment,
    },
  });
}

createManualLogs();
