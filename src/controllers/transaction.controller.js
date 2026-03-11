const prisma = require('../prisma');

// GET /api/transactions
const getTransactions = async (req, res) => {
  try {
    const { type, categoryId, startDate, endDate, limit = 50, page = 1 } = req.query;
    const where = { userId: req.userId };

    if (type) where.type = type.toUpperCase();
    if (categoryId) where.categoryId = categoryId;
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        include: { category: true },
        orderBy: { date: 'desc' },
        take: parseInt(limit),
        skip,
      }),
      prisma.transaction.count({ where }),
    ]);

    res.json({ transactions, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener transacciones', error: error.message });
  }
};

// GET /api/transactions/summary
const getSummary = async (req, res) => {
  try {
    const { month, year } = req.query;
    const now = new Date();
    const targetMonth = month ? parseInt(month) - 1 : now.getMonth();
    const targetYear = year ? parseInt(year) : now.getFullYear();

    const startDate = new Date(targetYear, targetMonth, 1);
    const endDate = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59);

    const where = { userId: req.userId, date: { gte: startDate, lte: endDate } };

    const [incomeResult, expenseResult, byCategory] = await Promise.all([
      prisma.transaction.aggregate({
        where: { ...where, type: 'INCOME' },
        _sum: { amount: true },
      }),
      prisma.transaction.aggregate({
        where: { ...where, type: 'EXPENSE' },
        _sum: { amount: true },
      }),
      prisma.transaction.groupBy({
        by: ['categoryId', 'type'],
        where,
        _sum: { amount: true },
        orderBy: { _sum: { amount: 'desc' } },
      }),
    ]);

    const totalIncome = incomeResult._sum.amount || 0;
    const totalExpense = expenseResult._sum.amount || 0;
    const balance = totalIncome - totalExpense;

    // Enriquecer con nombre de categoría
    const categoryIds = [...new Set(byCategory.map((b) => b.categoryId).filter(Boolean))];
    const categories = await prisma.category.findMany({ where: { id: { in: categoryIds } } });
    const catMap = Object.fromEntries(categories.map((c) => [c.id, c]));

    const categoryBreakdown = byCategory.map((b) => ({
      category: b.categoryId ? catMap[b.categoryId] : null,
      type: b.type,
      total: b._sum.amount,
    }));

    res.json({ totalIncome, totalExpense, balance, categoryBreakdown, month: targetMonth + 1, year: targetYear });
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener resumen', error: error.message });
  }
};

// POST /api/transactions
const createTransaction = async (req, res) => {
  try {
    const { amount, description, type, date, categoryId } = req.body;

    if (!amount || !type)
      return res.status(400).json({ message: 'Monto y tipo son requeridos' });
    if (amount <= 0)
      return res.status(400).json({ message: 'El monto debe ser mayor a 0' });
    if (!['INCOME', 'EXPENSE'].includes(type.toUpperCase()))
      return res.status(400).json({ message: 'Tipo debe ser INCOME o EXPENSE' });

    // Verificar que la categoría pertenece al usuario
    if (categoryId) {
      const cat = await prisma.category.findFirst({ where: { id: categoryId, userId: req.userId } });
      if (!cat) return res.status(404).json({ message: 'Categoría no encontrada' });
    }

    const transaction = await prisma.transaction.create({
      data: {
        amount: parseFloat(amount),
        description,
        type: type.toUpperCase(),
        date: date ? new Date(date) : new Date(),
        userId: req.userId,
        categoryId: categoryId || null,
      },
      include: { category: true },
    });

    res.status(201).json({ transaction });
  } catch (error) {
    res.status(500).json({ message: 'Error al crear transacción', error: error.message });
  }
};

// PUT /api/transactions/:id
const updateTransaction = async (req, res) => {
  try {
    const existing = await prisma.transaction.findFirst({ where: { id: req.params.id, userId: req.userId } });
    if (!existing) return res.status(404).json({ message: 'Transacción no encontrada' });

    const { amount, description, type, date, categoryId } = req.body;
    const transaction = await prisma.transaction.update({
      where: { id: req.params.id },
      data: {
        ...(amount && { amount: parseFloat(amount) }),
        ...(description !== undefined && { description }),
        ...(type && { type: type.toUpperCase() }),
        ...(date && { date: new Date(date) }),
        ...(categoryId !== undefined && { categoryId: categoryId || null }),
      },
      include: { category: true },
    });

    res.json({ transaction });
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar transacción', error: error.message });
  }
};

// DELETE /api/transactions/:id
const deleteTransaction = async (req, res) => {
  try {
    const existing = await prisma.transaction.findFirst({ where: { id: req.params.id, userId: req.userId } });
    if (!existing) return res.status(404).json({ message: 'Transacción no encontrada' });

    await prisma.transaction.delete({ where: { id: req.params.id } });
    res.json({ message: 'Transacción eliminada' });
  } catch (error) {
    res.status(500).json({ message: 'Error al eliminar transacción', error: error.message });
  }
};

module.exports = { getTransactions, getSummary, createTransaction, updateTransaction, deleteTransaction };
