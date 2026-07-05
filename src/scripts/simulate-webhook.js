const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const prisma = new PrismaClient();

async function simulateWebhook() {
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

    // Simulate a webhook payload for an issue event
    const deliveryId = crypto.randomBytes(16).toString('hex');
    const eventType = 'issues';
    const eventAction = 'opened';
    const payload = {
      action: 'opened',
      issue: {
        id: 4809485622,
        number: 4,
        title: 'login_issue',
        body: 'This is a test issue',
        user: {
          login: 'mummidivarapuvijaya'
        },
        html_url: 'https://github.com/mummidivarapuvijaya/Educase-frontend/issues/4'
      },
      repository: {
        id: 1152079996,
        name: 'Educase-frontend',
        owner: {
          login: 'mummidivarapuvijaya'
        }
      }
    };

    // Define the createBotLog function locally
    async function createBotLog(params) {
      console.log("\n💾 Creating BotActionLog with parameters:");
      console.log("Repository ID:", params.repositoryId);
      console.log("Delivery ID:", params.deliveryId);
      console.log("Event Type:", params.eventType);
      console.log("Title:", params.title);
      console.log("Author:", params.author);
      console.log("URL:", params.url);
      console.log("Status:", params.status);
      console.log("Actions taken:", params.actionsTaken);
      console.log("Error details:", params.errorDetails);

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

      try {
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
        console.log("✅ BotActionLog created successfully");
      } catch (dbError) {
        console.error("❌ Failed to create BotActionLog:", dbError);
        console.error("DB error details:", JSON.stringify(dbError, null, 2));
        throw dbError;
      }
    }

    // Call createBotLog directly
    console.log('\n💾 Creating BotActionLog...');
    await createBotLog({
      repositoryId: repo.id,
      deliveryId,
      eventType: `${eventType}.${eventAction}`,
      title: payload.issue.title,
      author: payload.issue.user.login,
      url: payload.issue.html_url,
      status: 'success',
      actionsTaken: ['Issue payload received'],
      errorDetails: null,
      aiSummary: null,
      aiPriority: null,
      aiSentiment: null,
    });

    console.log('✅ BotActionLog created successfully');

    // Check if the log was created
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
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
    console.log('Script completed');
  }
}

simulateWebhook();
