const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function createUserAndRelinkRepository() {
  try {
    // Get the repository
    const repo = await prisma.repository.findFirst({
      where: { userId: null }
    });

    if (!repo) {
      console.log('No repository without userId found.');
      return;
    }

    console.log(`Found repository: ${repo.owner}/${repo.name} (ID: ${repo.id})`);

    // Create a user
    const user = await prisma.user.create({
      data: {
        githubId: repo.githubId,
        username: repo.owner,
        avatarUrl: `https://github.com/${repo.owner}.png`,
        accessToken: 'dummy-access-token',
      }
    });

    console.log(`✅ Created user: ${user.username} (ID: ${user.id})`);

    // Update the repository with userId
    await prisma.repository.update({
      where: { id: repo.id },
      data: { userId: user.id }
    });

    console.log(`✅ Updated repository ${repo.owner}/${repo.name} with userId ${user.id}`);

    // Check if there are any logs now
    const logs = await prisma.botActionLog.findMany();
    console.log(`\nFound ${logs.length} logs after fixing user association`);

    if (logs.length > 0) {
      console.log('Logs found:');
      for (const log of logs) {
        console.log(`- ${log.eventType} for ${log.repositoryId} (ID: ${log.id})`);
      }
    }
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createUserAndRelinkRepository();
