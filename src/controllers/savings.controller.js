const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// GET /api/savings
const getSavingsGoals = async (req, res) => {
  try {
    const goals = await prisma.savingsGoal.findMany({
      where: { userId: req.user.id },
      include: { deposits: { orderBy: { date: 'desc' }, take: 5 } },
      orderBy: { createdAt: 'desc' },
    });

    const summary = {
      totalGoals: goals.length,
      activeGoals: goals.filter(g => g.status === 'ACTIVE').length,
      completedGoals: goals.filter(g => g.status === 'COMPLETED').length,
      totalTarget: goals.reduce((s, g) => s + g.targetAmount, 0),
      totalSaved: goals.reduce((s, g) => s + g.savedAmount, 0),
    };

    res.json({ goals, summary });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/savings/:id
const getSavingsGoalById = async (req, res) => {
  try {
    const goal = await prisma.savingsGoal.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      include: { deposits: { orderBy: { date: 'desc' } } },
    });
    if (!goal) return res.status(404).json({ message: 'Meta no encontrada' });
    res.json(goal);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/savings
const createSavingsGoal = async (req, res) => {
  try {
    const { name, icon, targetAmount, targetDate, initialDeposit } = req.body;
    if (!name || !targetAmount) return res.status(400).json({ message: 'Nombre y monto objetivo son requeridos' });

    const goal = await prisma.savingsGoal.create({
      data: {
        name,
        icon: icon || '🎯',
        targetAmount: parseFloat(targetAmount),
        savedAmount: initialDeposit ? parseFloat(initialDeposit) : 0,
        targetDate: targetDate ? new Date(targetDate) : null,
        userId: req.user.id,
        deposits: initialDeposit && parseFloat(initialDeposit) > 0
          ? { create: [{ amount: parseFloat(initialDeposit), note: 'Depósito inicial' }] }
          : undefined,
      },
      include: { deposits: true },
    });

    res.status(201).json(goal);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/savings/:id/deposits
const addDeposit = async (req, res) => {
  try {
    const { amount, note } = req.body;
    if (!amount || parseFloat(amount) <= 0) return res.status(400).json({ message: 'Monto inválido' });

    const goal = await prisma.savingsGoal.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!goal) return res.status(404).json({ message: 'Meta no encontrada' });
    if (goal.status === 'CANCELLED') return res.status(400).json({ message: 'No se puede depositar en una meta cancelada' });

    const newSaved = goal.savedAmount + parseFloat(amount);
    const completed = newSaved >= goal.targetAmount;

    const [deposit, updatedGoal] = await prisma.$transaction([
      prisma.savingsDeposit.create({
        data: { amount: parseFloat(amount), note: note || null, goalId: goal.id },
      }),
      prisma.savingsGoal.update({
        where: { id: goal.id },
        data: {
          savedAmount: newSaved,
          status: completed ? 'COMPLETED' : 'ACTIVE',
        },
      }),
    ]);

    res.status(201).json({ deposit, goal: updatedGoal, completed });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/savings/:id
const updateSavingsGoal = async (req, res) => {
  try {
    const { name, icon, targetAmount, targetDate, status } = req.body;
    const goal = await prisma.savingsGoal.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!goal) return res.status(404).json({ message: 'Meta no encontrada' });

    const updated = await prisma.savingsGoal.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name }),
        ...(icon && { icon }),
        ...(targetAmount && { targetAmount: parseFloat(targetAmount) }),
        ...(targetDate !== undefined && { targetDate: targetDate ? new Date(targetDate) : null }),
        ...(status && { status }),
      },
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// DELETE /api/savings/:id
const deleteSavingsGoal = async (req, res) => {
  try {
    const goal = await prisma.savingsGoal.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!goal) return res.status(404).json({ message: 'Meta no encontrada' });
    await prisma.savingsGoal.delete({ where: { id: req.params.id } });
    res.json({ message: 'Meta eliminada' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getSavingsGoals, getSavingsGoalById, createSavingsGoal, addDeposit, updateSavingsGoal, deleteSavingsGoal };
