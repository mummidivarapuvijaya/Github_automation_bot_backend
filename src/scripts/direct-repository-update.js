const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function directRepositoryUpdate() {
  try {
    // Get all repositories
    const repositories = await prisma.repository.findMany();
    console.log(`Found ${repositories.length} repositories:`);

    for (const repo of repositories) {
      console.log(`- ${repo.owner}/${repo.name} (ID: ${repo.id}, userId: ${repo.userId}, githubId: ${repo.githubId})`);

      // Update the repository with a userId
      if (repo.userId === null) {
        console.log(`Updating repository ${repo.owner}/${repo.name} with userId...`);

        // Create a user if it doesn't exist
        let user = await prisma.user.findFirst({
          where: { githubId: repo.githubId }
        });

        if (!user) {
          console.log(`Creating user for ${repo.owner}...`);
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
      }
    }

    // Check if there are any logs now
    const logs = await prisma.botActionLog.findMany();
    console.log(`\nFound ${logs.length} logs after updating repository`);

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

directRepositoryUpdate();
