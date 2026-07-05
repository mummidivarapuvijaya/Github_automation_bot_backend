const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const prisma = new PrismaClient();

async function createLogsForExistingIssues() {
  try {
    // Get the repository
    const repo = await prisma.repository.findFirst({
      where: { githubId: 1214363163 }
    });
    
    if (!repo) {
      // Try alternative lookup
      const allRepos = await prisma.repository.findMany();
      console.log("All repositories:", allRepos.map(r => ({ id: r.id, githubId: r.githubId, owner: r.owner, name: r.name })));
      
      // Try to find by owner/name
      const repoByOwnerName = await prisma.repository.findFirst({
        where: { owner: "mummidivarapuvijaya", name: "Educase-frontend" }
      });
      
      if (repoByOwnerName) {
        console.log(`Found repository by owner/name: ${repoByOwnerName.owner}/${repoByOwnerName.name}`);
        repo = repoByOwnerName;
      }
    }

    if (!repo) {
      console.log('Repository not found');
      return;
    }

    console.log(`Found repository: ${repo.owner}/${repo.name} (ID: ${repo.id})`);

    // Get issues from GitHub API
    const { Octokit } = require('@octokit/rest');
    
    if (!repo.user || !repo.user.accessToken) {
      console.log("Repository is not associated with a user. Skipping GitHub API calls.");
      return;
    }
    
    const octokit = new Octokit({ auth: repo.user.accessToken });

    const issues = await octokit.paginate(octokit.rest.issues.listForRepo, {
      owner: repo.owner,
      repo: repo.name,
      state: 'all',
      per_page: 100
    });

    console.log(`Found ${issues.length} issues in the repository`);

    // Create logs for each issue
    for (const issue of issues) {
      console.log(`\nProcessing issue #${issue.number}: ${issue.title}`);

      // Check if log already exists
      const existingLog = await prisma.botActionLog.findFirst({
        where: {
          repositoryId: repo.id,
          eventType: 'issues.opened',
          title: issue.title
        }
      });

      if (existingLog) {
        console.log(`Log already exists for issue #${issue.number}`);
        continue;
      }

      // Create a new log
      const deliveryId = crypto.randomBytes(16).toString('hex');

      try {
        await createBotLog({
          repositoryId: repo.id,
          deliveryId,
          eventType: 'issues.opened',
          title: issue.title,
          author: issue.user.login,
          url: issue.html_url,
          status: 'success',
          actionsTaken: ['Issue payload received'],
          errorDetails: null,
          aiSummary: null,
          aiPriority: null,
          aiSentiment: null,
        });

        console.log(`✅ Created log for issue #${issue.number}`);
      } catch (logError) {
        console.error(`❌ Failed to create log for issue #${issue.number}:`, logError);
      }
    }

    console.log('\n✅ Finished processing all issues');
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

createLogsForExistingIssues();
