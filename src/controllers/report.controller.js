const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// GET /api/reports/monthly?month=3&year=2026
const getMonthlyReport = async (req, res) => {
  try {
    const now = new Date();
    const month = parseInt(req.query.month) || now.getMonth() + 1;
    const year = parseInt(req.query.year) || now.getFullYear();
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59);

    // Totales de ingresos y gastos
    const [incomeAgg, expenseAgg] = await Promise.all([
      prisma.transaction.aggregate({
        where: { userId: req.user.id, type: 'INCOME', date: { gte: start, lte: end } },
        _sum: { amount: true }, _count: true,
      }),
      prisma.transaction.aggregate({
        where: { userId: req.user.id, type: 'EXPENSE', date: { gte: start, lte: end } },
        _sum: { amount: true }, _count: true,
      }),
    ]);

    const totalIncome = incomeAgg._sum.amount || 0;
    const totalExpense = expenseAgg._sum.amount || 0;
    const balance = totalIncome - totalExpense;
    const savingsRate = totalIncome > 0 ? Math.round(((totalIncome - totalExpense) / totalIncome) * 100) : 0;

    // Gastos por categoría
    const expenseByCategory = await prisma.transaction.groupBy({
      by: ['categoryId'],
      where: { userId: req.user.id, type: 'EXPENSE', date: { gte: start, lte: end } },
      _sum: { amount: true },
      orderBy: { _sum: { amount: 'desc' } },
    });
    const categoryDetails = await Promise.all(expenseByCategory.map(async (e) => {
      const cat = e.categoryId ? await prisma.category.findUnique({ where: { id: e.categoryId } }) : null;
      const pct = totalExpense > 0 ? Math.round(((e._sum.amount || 0) / totalExpense) * 100) : 0;
      return { category: cat, amount: e._sum.amount || 0, percentage: pct };
    }));

    // Ingresos por categoría
    const incomeByCategory = await prisma.transaction.groupBy({
      by: ['categoryId'],
      where: { userId: req.user.id, type: 'INCOME', date: { gte: start, lte: end } },
      _sum: { amount: true },
      orderBy: { _sum: { amount: 'desc' } },
    });
    const incomeDetails = await Promise.all(incomeByCategory.map(async (e) => {
      const cat = e.categoryId ? await prisma.category.findUnique({ where: { id: e.categoryId } }) : null;
      const pct = totalIncome > 0 ? Math.round(((e._sum.amount || 0) / totalIncome) * 100) : 0;
      return { category: cat, amount: e._sum.amount || 0, percentage: pct };
    }));

    // Top 5 transacciones del mes
    const topTransactions = await prisma.transaction.findMany({
      where: { userId: req.user.id, date: { gte: start, lte: end } },
      include: { category: true },
      orderBy: { amount: 'desc' },
      take: 5,
    });

    // Presupuestos vs real
    const budgets = await prisma.budget.findMany({
      where: { userId: req.user.id, month, year },
      include: { category: true },
    });
    const budgetComparison = await Promise.all(budgets.map(async (b) => {
      const agg = await prisma.transaction.aggregate({
        where: { userId: req.user.id, categoryId: b.categoryId, type: 'EXPENSE', date: { gte: start, lte: end } },
        _sum: { amount: true },
      });
      const spent = agg._sum.amount || 0;
      return { ...b, spent, percentage: Math.round((spent / b.amount) * 100), status: spent > b.amount ? 'exceeded' : spent >= b.amount * 0.8 ? 'warning' : 'ok' };
    }));

    res.json({
      period: { month, year },
      summary: { totalIncome, totalExpense, balance, savingsRate, incomeCount: incomeAgg._count, expenseCount: expenseAgg._count },
      expenseByCategory: categoryDetails,
      incomeByCategory: incomeDetails,
      topTransactions,
      budgetComparison,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/reports/yearly?year=2026
const getYearlyReport = async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();

    // Datos mes a mes
    const monthlyData = await Promise.all(
      Array.from({ length: 12 }, (_, i) => i + 1).map(async (month) => {
        const start = new Date(year, month - 1, 1);
        const end = new Date(year, month, 0, 23, 59, 59);
        const [inc, exp] = await Promise.all([
          prisma.transaction.aggregate({ where: { userId: req.user.id, type: 'INCOME', date: { gte: start, lte: end } }, _sum: { amount: true } }),
          prisma.transaction.aggregate({ where: { userId: req.user.id, type: 'EXPENSE', date: { gte: start, lte: end } }, _sum: { amount: true } }),
        ]);
        return { month, income: inc._sum.amount || 0, expense: exp._sum.amount || 0, balance: (inc._sum.amount || 0) - (exp._sum.amount || 0) };
      })
    );

    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31, 23, 59, 59);
    const [totalIncome, totalExpense] = await Promise.all([
      prisma.transaction.aggregate({ where: { userId: req.user.id, type: 'INCOME', date: { gte: yearStart, lte: yearEnd } }, _sum: { amount: true } }),
      prisma.transaction.aggregate({ where: { userId: req.user.id, type: 'EXPENSE', date: { gte: yearStart, lte: yearEnd } }, _sum: { amount: true } }),
    ]);

    // Financiamientos del año
    const financingStats = await prisma.financing.aggregate({
      where: { userId: req.user.id },
      _sum: { capital: true, totalInterest: true, totalAmount: true },
      _count: true,
    });
    const activeFinancings = await prisma.financing.count({ where: { userId: req.user.id, status: 'ACTIVE' } });
    const collectedPayments = await prisma.financingPayment.aggregate({
      where: { financing: { userId: req.user.id }, date: { gte: yearStart, lte: yearEnd } },
      _sum: { amount: true },
    });

    // Deudas
    const debtStats = await prisma.debt.aggregate({ where: { userId: req.user.id }, _sum: { totalAmount: true, paidAmount: true }, _count: true });
    const activeDebts = await prisma.debt.count({ where: { userId: req.user.id, status: 'ACTIVE' } });

    // Ahorros
    const savingsStats = await prisma.savingsGoal.aggregate({ where: { userId: req.user.id }, _sum: { targetAmount: true, savedAmount: true }, _count: true });
    const completedSavings = await prisma.savingsGoal.count({ where: { userId: req.user.id, status: 'COMPLETED' } });

    res.json({
      year,
      monthlyData,
      annual: {
        totalIncome: totalIncome._sum.amount || 0,
        totalExpense: totalExpense._sum.amount || 0,
        balance: (totalIncome._sum.amount || 0) - (totalExpense._sum.amount || 0),
      },
      financings: {
        total: financingStats._count,
        active: activeFinancings,
        capitalDeployed: financingStats._sum.capital || 0,
        expectedProfit: financingStats._sum.totalInterest || 0,
        collectedThisYear: collectedPayments._sum.amount || 0,
      },
      debts: {
        total: debtStats._count,
        active: activeDebts,
        totalOwed: (debtStats._sum.totalAmount || 0) - (debtStats._sum.paidAmount || 0),
      },
      savings: {
        total: savingsStats._count,
        completed: completedSavings,
        totalSaved: savingsStats._sum.savedAmount || 0,
        totalTarget: savingsStats._sum.targetAmount || 0,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getMonthlyReport, getYearlyReport };
