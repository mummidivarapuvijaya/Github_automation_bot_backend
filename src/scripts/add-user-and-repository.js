const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function addUserAndRepository() {
  try {
    // Add a user
    const user = await prisma.user.create({
      data: {
        githubId: 12345678, // Replace with actual GitHub ID
        username: 'mummidivarapuvijaya', // Replace with actual username
        avatarUrl: 'https://avatars.githubusercontent.com/u/12345678?v=4', // Replace with actual avatar URL
        accessToken: 'fake-access-token', // Replace with actual access token
      }
    });

    console.log(`✅ Created user: ${user.username} (ID: ${user.id})`);

    // Update the repository with userId
    const repo = await prisma.repository.findFirst({
      where: { userId: null }
    });

    if (!repo) {
      console.log('No repository without userId found.');
      return;
    }

    console.log(`Found repository: ${repo.owner}/${repo.name} (ID: ${repo.id})`);

    // Update the repository with userId
    await prisma.repository.update({
      where: { id: repo.id },
      data: { userId: user.id }
    });

    console.log(`✅ Updated repository ${repo.owner}/${repo.name} with userId ${user.id}`);
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

addUserAndRepository();
