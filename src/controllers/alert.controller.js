const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Genera alertas automáticas revisando el estado actual del usuario
const generateAutoAlerts = async (userId) => {
  const now = new Date();
  const alerts = [];

  // 1. Deudas vencidas o próximas a vencer
  const debts = await prisma.debt.findMany({ where: { userId, status: 'ACTIVE' } });
  for (const debt of debts) {
    if (!debt.dueDate) continue;
    const daysLeft = Math.ceil((new Date(debt.dueDate) - now) / (1000 * 60 * 60 * 24));
    if (daysLeft < 0) {
      const exists = await prisma.alert.findFirst({ where: { userId, relatedId: debt.id, type: 'DEBT_OVERDUE' } });
      if (!exists) alerts.push({ type: 'DEBT_OVERDUE', title: '⚠️ Deuda vencida', message: `Tu deuda con "${debt.creditor}" venció hace ${Math.abs(daysLeft)} días.`, relatedId: debt.id, userId });
    } else if (daysLeft <= 7) {
      const exists = await prisma.alert.findFirst({ where: { userId, relatedId: debt.id, type: 'DEBT_DUE_SOON' } });
      if (!exists) alerts.push({ type: 'DEBT_DUE_SOON', title: '📅 Deuda próxima a vencer', message: `Tu deuda con "${debt.creditor}" vence en ${daysLeft} días.`, relatedId: debt.id, userId });
    }
  }

  // 2. Financiamientos activos con pagos atrasados
  const financings = await prisma.financing.findMany({
    where: { userId, status: 'ACTIVE' },
    include: { payments: true },
  });
  for (const fin of financings) {
    const monthsElapsed = Math.floor((now - new Date(fin.startDate)) / (1000 * 60 * 60 * 24 * 30));
    const expectedPaid = Math.min(monthsElapsed, fin.installments);
    if (fin.payments.length < expectedPaid) {
      const behind = expectedPaid - fin.payments.length;
      const exists = await prisma.alert.findFirst({ where: { userId, relatedId: fin.id, type: 'FINANCING_OVERDUE' } });
      if (!exists) alerts.push({ type: 'FINANCING_OVERDUE', title: '💸 Cobro pendiente', message: `"${fin.clientName}" lleva ${behind} cuota(s) sin pagar en "${fin.itemDescription}".`, relatedId: fin.id, userId });
    }
  }

  // 3. Presupuestos excedidos o en alerta (este mes)
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const budgets = await prisma.budget.findMany({ where: { userId, month, year }, include: { category: true } });
  for (const budget of budgets) {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59);
    const agg = await prisma.transaction.aggregate({
      where: { userId, categoryId: budget.categoryId, type: 'EXPENSE', date: { gte: start, lte: end } },
      _sum: { amount: true },
    });
    const spent = agg._sum.amount || 0;
    const pct = spent / budget.amount;
    if (pct >= 1) {
      const exists = await prisma.alert.findFirst({ where: { userId, relatedId: budget.id, type: 'BUDGET_EXCEEDED' } });
      if (!exists) alerts.push({ type: 'BUDGET_EXCEEDED', title: '🚨 Presupuesto excedido', message: `Superaste el presupuesto de "${budget.category.name}": gastaste ${Math.round(pct * 100)}% del límite.`, relatedId: budget.id, userId });
    } else if (pct >= 0.8) {
      const exists = await prisma.alert.findFirst({ where: { userId, relatedId: budget.id, type: 'BUDGET_WARNING' } });
      if (!exists) alerts.push({ type: 'BUDGET_WARNING', title: '⚡ Casi en el límite', message: `Has usado el ${Math.round(pct * 100)}% del presupuesto de "${budget.category.name}".`, relatedId: budget.id, userId });
    }
  }

  if (alerts.length > 0) {
    await prisma.alert.createMany({ data: alerts });
  }
  return alerts.length;
};

// GET /api/alerts
const getAlerts = async (req, res) => {
  try {
    await generateAutoAlerts(req.user.id);
    const alerts = await prisma.alert.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    const unreadCount = alerts.filter(a => !a.read).length;
    res.json({ alerts, unreadCount });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PATCH /api/alerts/:id/read
const markRead = async (req, res) => {
  try {
    const alert = await prisma.alert.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!alert) return res.status(404).json({ message: 'Alerta no encontrada' });
    await prisma.alert.update({ where: { id: req.params.id }, data: { read: true } });
    res.json({ message: 'Marcada como leída' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PATCH /api/alerts/read-all
const markAllRead = async (req, res) => {
  try {
    await prisma.alert.updateMany({ where: { userId: req.user.id, read: false }, data: { read: true } });
    res.json({ message: 'Todas marcadas como leídas' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// DELETE /api/alerts/:id
const deleteAlert = async (req, res) => {
  try {
    const alert = await prisma.alert.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!alert) return res.status(404).json({ message: 'Alerta no encontrada' });
    await prisma.alert.delete({ where: { id: req.params.id } });
    res.json({ message: 'Eliminada' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── BUDGETS ────────────────────────────────────────────────────────────────

// GET /api/alerts/budgets
const getBudgets = async (req, res) => {
  try {
    const now = new Date();
    const month = parseInt(req.query.month) || now.getMonth() + 1;
    const year = parseInt(req.query.year) || now.getFullYear();
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59);

    const budgets = await prisma.budget.findMany({
      where: { userId: req.user.id, month, year },
      include: { category: true },
    });

    const result = await Promise.all(budgets.map(async (b) => {
      const agg = await prisma.transaction.aggregate({
        where: { userId: req.user.id, categoryId: b.categoryId, type: 'EXPENSE', date: { gte: start, lte: end } },
        _sum: { amount: true },
      });
      const spent = agg._sum.amount || 0;
      return { ...b, spent, percentage: Math.round((spent / b.amount) * 100) };
    }));

    res.json({ budgets: result, month, year });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/alerts/budgets
const createBudget = async (req, res) => {
  try {
    const { categoryId, amount, month, year } = req.body;
    if (!categoryId || !amount) return res.status(400).json({ message: 'Categoría y monto son requeridos' });
    const now = new Date();
    const budget = await prisma.budget.upsert({
      where: { categoryId_userId_month_year: { categoryId, userId: req.user.id, month: month || now.getMonth() + 1, year: year || now.getFullYear() } },
      update: { amount: parseFloat(amount) },
      create: { categoryId, userId: req.user.id, amount: parseFloat(amount), month: month || now.getMonth() + 1, year: year || now.getFullYear() },
      include: { category: true },
    });
    res.status(201).json(budget);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// DELETE /api/alerts/budgets/:id
const deleteBudget = async (req, res) => {
  try {
    const budget = await prisma.budget.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!budget) return res.status(404).json({ message: 'Presupuesto no encontrado' });
    await prisma.budget.delete({ where: { id: req.params.id } });
    res.json({ message: 'Eliminado' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getAlerts, markRead, markAllRead, deleteAlert, getBudgets, createBudget, deleteBudget };
