const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixRepositoryUserId() {
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

    // Create a user if it doesn't exist
    let user = await prisma.user.findFirst({
      where: { githubId: repo.githubId }
    });

    if (!user) {
      console.log('Creating user...');
      user = await prisma.user.create({
        data: {
          githubId: repo.githubId,
          username: repo.owner,
          avatarUrl: `https://github.com/${repo.owner}.png`,
          accessToken: 'dummy-access-token',
        }
      });
      console.log(`✅ Created user: ${user.username} (ID: ${user.id})`);
    }

    // Update the repository with userId
    await prisma.repository.update({
      where: { id: repo.id },
      data: { userId: user.id }
    });

    console.log(`✅ Updated repository ${repo.owner}/${repo.name} with userId ${user.id}`);

    // Check if there are any logs now
    const logs = await prisma.botActionLog.findMany({
      where: { repositoryId: repo.id }
    });

    console.log(`\nFound ${logs.length} logs for repository`);

    if (logs.length > 0) {
      console.log('Logs:');
      for (const log of logs) {
        console.log(`- ${log.eventType} (ID: ${log.id})`);
      }
    }
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixRepositoryUserId();
