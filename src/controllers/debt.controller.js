const prisma = require('../prisma');

// GET /api/debts
const getDebts = async (req, res) => {
  try {
    const { status } = req.query;
    const where = { userId: req.userId };
    if (status) where.status = status.toUpperCase();

    const debts = await prisma.debt.findMany({
      where,
      include: { payments: { orderBy: { date: 'desc' } } },
      orderBy: { createdAt: 'desc' },
    });

    const summary = {
      totalDebt: debts.filter(d => d.status !== 'PAID').reduce((s, d) => s + (d.totalAmount - d.paidAmount), 0),
      totalPaid: debts.reduce((s, d) => s + d.paidAmount, 0),
      activeCount: debts.filter(d => d.status === 'ACTIVE').length,
      overdueCount: debts.filter(d => d.status === 'OVERDUE').length,
    };

    res.json({ debts, summary });
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener deudas', error: error.message });
  }
};

// POST /api/debts
const createDebt = async (req, res) => {
  try {
    const { creditor, description, totalAmount, monthlyPayment, dueDate } = req.body;
    if (!creditor || !totalAmount) return res.status(400).json({ message: 'Acreedor y monto son requeridos' });

    const debt = await prisma.debt.create({
      data: {
        creditor,
        description,
        totalAmount: parseFloat(totalAmount),
        monthlyPayment: monthlyPayment ? parseFloat(monthlyPayment) : null,
        dueDate: dueDate ? new Date(dueDate) : null,
        userId: req.userId,
      },
    });
    res.status(201).json({ debt });
  } catch (error) {
    res.status(500).json({ message: 'Error al crear deuda', error: error.message });
  }
};

// POST /api/debts/:id/payments
const addDebtPayment = async (req, res) => {
  try {
    const debt = await prisma.debt.findFirst({ where: { id: req.params.id, userId: req.userId } });
    if (!debt) return res.status(404).json({ message: 'Deuda no encontrada' });

    const { amount, note, date } = req.body;
    if (!amount || parseFloat(amount) <= 0) return res.status(400).json({ message: 'Monto inválido' });

    const newPaid = debt.paidAmount + parseFloat(amount);
    const remaining = debt.totalAmount - newPaid;
    const newStatus = remaining <= 0 ? 'PAID' : debt.status;

    const [payment] = await prisma.$transaction([
      prisma.debtPayment.create({
        data: { amount: parseFloat(amount), note, date: date ? new Date(date) : new Date(), debtId: debt.id },
      }),
      prisma.debt.update({
        where: { id: debt.id },
        data: { paidAmount: newPaid, status: newStatus },
      }),
    ]);

    res.status(201).json({ payment, remaining: Math.max(0, remaining), status: newStatus });
  } catch (error) {
    res.status(500).json({ message: 'Error al registrar pago', error: error.message });
  }
};

// PUT /api/debts/:id
const updateDebt = async (req, res) => {
  try {
    const existing = await prisma.debt.findFirst({ where: { id: req.params.id, userId: req.userId } });
    if (!existing) return res.status(404).json({ message: 'Deuda no encontrada' });

    const { creditor, description, totalAmount, monthlyPayment, dueDate, status } = req.body;
    const debt = await prisma.debt.update({
      where: { id: req.params.id },
      data: {
        ...(creditor && { creditor }),
        ...(description !== undefined && { description }),
        ...(totalAmount && { totalAmount: parseFloat(totalAmount) }),
        ...(monthlyPayment !== undefined && { monthlyPayment: monthlyPayment ? parseFloat(monthlyPayment) : null }),
        ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
        ...(status && { status }),
      },
    });
    res.json({ debt });
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar deuda', error: error.message });
  }
};

// DELETE /api/debts/:id
const deleteDebt = async (req, res) => {
  try {
    const existing = await prisma.debt.findFirst({ where: { id: req.params.id, userId: req.userId } });
    if (!existing) return res.status(404).json({ message: 'Deuda no encontrada' });
    await prisma.debt.delete({ where: { id: req.params.id } });
    res.json({ message: 'Deuda eliminada' });
  } catch (error) {
    res.status(500).json({ message: 'Error al eliminar deuda', error: error.message });
  }
};

module.exports = { getDebts, createDebt, addDebtPayment, updateDebt, deleteDebt };
