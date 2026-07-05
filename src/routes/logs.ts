import { Router, Response } from 'express';
import { prisma } from '../db';
import { AuthenticatedRequest, authenticateJWT } from '../middleware/auth';

const router = Router();

// Get action logs for a specific repository or all connected repositories
router.get('/', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  const { repositoryId } = req.query;

  try {
    // Resolve the repository identifier. The UI may send either the internal DB ID
    // or the GitHub repository ID. We look up the repository and use its internal ID.
    let resolvedRepoId: string | undefined;
    if (repositoryId) {
      const repoIdStr = repositoryId as string;
      console.log(`Looking up repository with ID: ${repoIdStr}`);
      
      // First try to find by internal ID
      let repo = await prisma.repository.findUnique({
        where: { id: repoIdStr }
      });
      
      // If not found, try by GitHub ID
      if (!repo) {
        const numericRepoId = Number(repoIdStr);
        if (!isNaN(numericRepoId)) {
          repo = await prisma.repository.findFirst({
            where: { githubId: numericRepoId }
          });
          console.log(`Tried GitHub ID ${numericRepoId}, found:`, !!repo);
        }
      }
      
      if (repo) {
        resolvedRepoId = repo.id;
        console.log(`✅ Repository resolved: GitHub ID ${repo.githubId} maps to internal ID ${resolvedRepoId}`);
      } else {
        console.log(`❌ Repository not found for ID: ${repoIdStr}`);
      }
    }

    let whereClause: any;
    if (resolvedRepoId) {
      // Fetch logs for the resolved repository only
      whereClause = { repositoryId: resolvedRepoId };
      console.log(`✅ Using resolved repository ID: ${resolvedRepoId}`);
    } else {
      // Otherwise, restrict to repositories owned by the authenticated user
      console.log(`⚠️ No resolved repository ID, using user ID filter: ${req.user?.id}`);
      whereClause = {
        repository: {
          userId: req.user?.id,
        },
      };
    }

    // Debug logs – after whereClause resolved
    console.log('--- LOGS ROUTE DEBUG ---');
    console.log('Query repositoryId:', repositoryId);
    console.log('Resolved repository DB ID:', resolvedRepoId);
    console.log('Authenticated user ID:', req.user?.id);
    console.log('Generated whereClause:', JSON.stringify(whereClause, null, 2));

    console.log("\n🔍 Fetching logs with whereClause:", JSON.stringify(whereClause, null, 2));
    
    const logs = await prisma.botActionLog.findMany({
      where: whereClause,
      include: {
        repository: {
          select: {
            owner: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100, // Limit to recent 100 logs
    });
    
    console.log(`✅ Found ${logs.length} logs`);
    
    // Prevent client-side caching so new logs are always fetched
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json(logs);
  } catch (error) {
    console.error('Error fetching logs:', error);
    res.status(500).json({ error: 'Internal server error fetching logs.' });
  }
});

// Clear action logs for a repository
router.delete('/:repositoryId', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  const { repositoryId } = req.params;

  try {
    const repo = await prisma.repository.findFirst({
      where: { id: repositoryId, userId: req.user?.id },
    });

    if (!repo) {
      return res.status(404).json({ error: 'Repository not found or access denied.' });
    }

    await prisma.botActionLog.deleteMany({
      where: { repositoryId },
    });

    res.json({ message: 'Logs cleared successfully.' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error clearing logs.' });
  }
});

export default router;
