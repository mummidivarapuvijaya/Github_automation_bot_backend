import { Router, Response } from 'express';
import { prisma } from '../db';
import { AuthenticatedRequest, authenticateJWT } from '../middleware/auth';

const router = Router();

// Get rules for a repository
router.get('/:repositoryId', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  const { repositoryId } = req.params;

  try {
    const repo = await prisma.repository.findFirst({
      where: { id: repositoryId, userId: req.user?.id },
    });

    if (!repo) {
      return res.status(404).json({ error: 'Repository not found or access denied.' });
    }

    const rules = await prisma.rule.findMany({
      where: { repositoryId },
      orderBy: { createdAt: 'desc' },
    });

    res.json(rules);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error fetching rules.' });
  }
});

// Create a new rule
router.post('/', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  const { repositoryId, name, triggerEvent, conditions, actions, isActive } = req.body;

  if (!repositoryId || !name || !triggerEvent || !conditions || !actions) {
    return res.status(400).json({ error: 'Missing required parameters.' });
  }

  try {
    const repo = await prisma.repository.findFirst({
      where: { id: repositoryId, userId: req.user?.id },
    });

    if (!repo) {
      return res.status(404).json({ error: 'Repository not found or access denied.' });
    }

    const rule = await prisma.rule.create({
      data: {
        repositoryId,
        name,
        triggerEvent,
        conditions: typeof conditions === 'string' ? conditions : JSON.stringify(conditions),
        actions: typeof actions === 'string' ? actions : JSON.stringify(actions),
        isActive: isActive !== undefined ? isActive : true,
      },
    });

    res.status(201).json(rule);
  } catch (error) {
    console.error('Error creating rule:', error);
    res.status(500).json({ error: 'Internal server error creating rule.' });
  }
});

// Update an existing rule
router.put('/:id', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { name, triggerEvent, conditions, actions, isActive } = req.body;

  try {
    // Ensure rule exists and belongs to a repo owned by this user
    const rule = await prisma.rule.findFirst({
      where: {
        id,
        repository: { userId: req.user?.id },
      },
    });

    if (!rule) {
      return res.status(404).json({ error: 'Rule not found or access denied.' });
    }

    const updated = await prisma.rule.update({
      where: { id },
      data: {
        name: name !== undefined ? name : rule.name,
        triggerEvent: triggerEvent !== undefined ? triggerEvent : rule.triggerEvent,
        conditions: conditions !== undefined ? (typeof conditions === 'string' ? conditions : JSON.stringify(conditions)) : rule.conditions,
        actions: actions !== undefined ? (typeof actions === 'string' ? actions : JSON.stringify(actions)) : rule.actions,
        isActive: isActive !== undefined ? isActive : rule.isActive,
      },
    });

    res.json(updated);
  } catch (error) {
    console.error('Error updating rule:', error);
    res.status(500).json({ error: 'Internal server error updating rule.' });
  }
});

// Delete a rule
router.delete('/:id', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;

  try {
    const rule = await prisma.rule.findFirst({
      where: {
        id,
        repository: { userId: req.user?.id },
      },
    });

    if (!rule) {
      return res.status(404).json({ error: 'Rule not found or access denied.' });
    }

    await prisma.rule.delete({
      where: { id },
    });

    res.json({ message: 'Rule deleted successfully.' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error deleting rule.' });
  }
});

export default router;
