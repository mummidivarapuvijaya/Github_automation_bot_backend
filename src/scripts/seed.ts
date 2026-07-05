import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seed() {
  console.log('Seeding local SQLite database with mock testing credentials...');

  try {
    // 1. Clean existing records to avoid unique constraint violations
    await prisma.botActionLog.deleteMany();
    await prisma.rule.deleteMany();
    await prisma.repository.deleteMany();
    await prisma.user.deleteMany();
    await prisma.webhookDelivery.deleteMany();

    // 2. Create mock user
    const user = await prisma.user.create({
      data: {
        githubId: 999999,
        username: 'mock-github-user',
        avatarUrl: 'https://avatars.githubusercontent.com/u/9919?v=4',
        accessToken: 'mock-github-oauth-access-token-1234567890',
      },
    });

    // 3. Create mock repository
    const repo = await prisma.repository.create({
      data: {
        githubId: 888888,
        owner: 'mock-github-user',
        name: 'test-automation-repo',
        webhookId: '777777',
        webhookSecret: 'super-secret-local-webhook-signing-key',
        slackWebhookUrl: process.env.SLACK_WEBHOOK_URL || null, // Pick up slack webhook from env if set
        userId: user.id,
      },
    });

    // 4. Create default rules
    await prisma.rule.createMany({
      data: [
        {
          repositoryId: repo.id,
          name: 'Critical Bug Triage & Alert',
          triggerEvent: 'issues',
          conditions: JSON.stringify({ keyword: 'bug', author: '' }),
          actions: JSON.stringify({
            comment: '🤖 Auto-Response: This critical bug has been flagged for rapid triage. Gemini AI is summarizing details below.',
            label: 'bug',
            slack: true,
            ai: true,
          }),
        },
        {
          repositoryId: repo.id,
          name: 'General Issue Welcome Comment',
          triggerEvent: 'issues',
          conditions: JSON.stringify({ keyword: '', author: '' }),
          actions: JSON.stringify({
            comment: '👋 Thanks for opening this issue! The repository automation bot has alerted our Slack channel.',
            label: '',
            slack: true,
            ai: false,
          }),
        },
      ],
    });

    console.log('Seeding completed successfully!');
    console.log(`Mock User Created: "${user.username}"`);
    console.log(`Mock Repository Connected: "${repo.owner}/${repo.name}"`);
    console.log('Rules generated:');
    console.log(' 1. "Critical Bug Triage & Alert" (Triggers on "bug" keyword, runs AI Triage, adds label, comments, alerts Slack)');
    console.log(' 2. "General Issue Welcome Comment" (Triggers on all issues, comments, alerts Slack)');
    console.log('\nYou can now run the test webhook script or launch the dev server to explore the logs/rules dashboard!');
  } catch (error) {
    console.error('Failed to seed database:', error);
  } finally {
    await prisma.$disconnect();
  }
}

seed();
