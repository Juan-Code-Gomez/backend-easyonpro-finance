const prisma = require('../prisma');

// Cálculo de interés fijo mensual
// Total = Capital + (Capital × tasa × cuotas)
// Cuota = Total / cuotas
const calculateFinancing = (capital, interestRate, installments) => {
  const totalInterest = capital * (interestRate / 100) * installments;
  const totalAmount = capital + totalInterest;
  const installmentAmount = totalAmount / installments;
  return { totalInterest, totalAmount, installmentAmount };
};

// GET /api/financings
const getFinancings = async (req, res) => {
  try {
    const { status } = req.query;
    const where = { userId: req.userId };
    if (status) where.status = status.toUpperCase();

    const financings = await prisma.financing.findMany({
      where,
      include: { payments: { orderBy: { installmentNo: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });

    // Enriquecer con datos calculados
    const enriched = financings.map((f) => {
      const paidAmount = f.payments.reduce((s, p) => s + p.amount, 0);
      const paidInstallments = f.payments.length;
      const remaining = f.totalAmount - paidAmount;
      const nextInstallment = paidInstallments + 1;
      return { ...f, paidAmount, paidInstallments, remaining: Math.max(0, remaining), nextInstallment };
    });

    const summary = {
      totalCapital: financings.filter(f => f.status !== 'PAID').reduce((s, f) => s + f.capital, 0),
      totalExpectedProfit: financings.reduce((s, f) => s + f.totalInterest, 0),
      totalCollected: enriched.reduce((s, f) => s + f.paidAmount, 0),
      activeCount: financings.filter(f => f.status === 'ACTIVE').length,
      overdueCount: financings.filter(f => f.status === 'OVERDUE').length,
    };

    res.json({ financings: enriched, summary });
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener financiamientos', error: error.message });
  }
};

// GET /api/financings/:id
const getFinancingById = async (req, res) => {
  try {
    const financing = await prisma.financing.findFirst({
      where: { id: req.params.id, userId: req.userId },
      include: { payments: { orderBy: { installmentNo: 'asc' } } },
    });
    if (!financing) return res.status(404).json({ message: 'Financiamiento no encontrado' });

    // Generar tabla de cuotas completa
    const paidMap = {};
    financing.payments.forEach(p => { paidMap[p.installmentNo] = p; });

    const schedule = Array.from({ length: financing.installments }, (_, i) => {
      const no = i + 1;
      const payment = paidMap[no] || null;
      return {
        installmentNo: no,
        amount: financing.installmentAmount,
        paid: !!payment,
        paymentDate: payment?.date || null,
        paymentNote: payment?.note || null,
      };
    });

    const paidAmount = financing.payments.reduce((s, p) => s + p.amount, 0);
    const paidInstallments = financing.payments.length;

    res.json({
      financing: {
        ...financing,
        paidAmount,
        paidInstallments,
        remaining: Math.max(0, financing.totalAmount - paidAmount),
        nextInstallment: paidInstallments + 1,
      },
      schedule,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener financiamiento', error: error.message });
  }
};

// POST /api/financings/calculate  (preview antes de crear)
const calculatePreview = async (req, res) => {
  try {
    const { capital, interestRate, installments } = req.body;
    if (!capital || !interestRate || !installments)
      return res.status(400).json({ message: 'Capital, tasa e cuotas son requeridos' });

    const result = calculateFinancing(parseFloat(capital), parseFloat(interestRate), parseInt(installments));
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error en cálculo', error: error.message });
  }
};

// POST /api/financings
const createFinancing = async (req, res) => {
  try {
    const { clientName, clientPhone, itemDescription, itemType, capital, interestRate, installments, startDate } = req.body;

    if (!clientName || !itemDescription || !capital || !interestRate || !installments)
      return res.status(400).json({ message: 'Todos los campos son requeridos' });

    const { totalInterest, totalAmount, installmentAmount } = calculateFinancing(
      parseFloat(capital), parseFloat(interestRate), parseInt(installments)
    );

    const financing = await prisma.financing.create({
      data: {
        clientName,
        clientPhone,
        itemDescription,
        itemType: itemType || 'Otro',
        capital: parseFloat(capital),
        interestRate: parseFloat(interestRate),
        installments: parseInt(installments),
        installmentAmount,
        totalAmount,
        totalInterest,
        startDate: startDate ? new Date(startDate) : new Date(),
        userId: req.userId,
      },
    });

    res.status(201).json({ financing });
  } catch (error) {
    res.status(500).json({ message: 'Error al crear financiamiento', error: error.message });
  }
};

// POST /api/financings/:id/payments
const addFinancingPayment = async (req, res) => {
  try {
    const financing = await prisma.financing.findFirst({
      where: { id: req.params.id, userId: req.userId },
      include: { payments: true },
    });
    if (!financing) return res.status(404).json({ message: 'Financiamiento no encontrado' });

    const paidInstallments = financing.payments.length;
    if (paidInstallments >= financing.installments)
      return res.status(400).json({ message: 'Este financiamiento ya está completamente pagado' });

    const { note, date, installmentNo } = req.body;
    const nextNo = installmentNo || paidInstallments + 1;

    const alreadyPaid = financing.payments.find(p => p.installmentNo === nextNo);
    if (alreadyPaid) return res.status(400).json({ message: `La cuota #${nextNo} ya fue registrada` });

    const newPaidCount = paidInstallments + 1;
    const newStatus = newPaidCount >= financing.installments ? 'PAID' : 'ACTIVE';

    const [payment] = await prisma.$transaction([
      prisma.financingPayment.create({
        data: {
          installmentNo: nextNo,
          amount: financing.installmentAmount,
          note,
          date: date ? new Date(date) : new Date(),
          financingId: financing.id,
        },
      }),
      prisma.financing.update({
        where: { id: financing.id },
        data: { status: newStatus },
      }),
    ]);

    res.status(201).json({
      payment,
      paidInstallments: newPaidCount,
      remaining: Math.max(0, financing.installments - newPaidCount),
      status: newStatus,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error al registrar pago', error: error.message });
  }
};

// PUT /api/financings/:id/status
const updateFinancingStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!['ACTIVE', 'PAID', 'OVERDUE'].includes(status))
      return res.status(400).json({ message: 'Estado inválido' });

    const existing = await prisma.financing.findFirst({ where: { id: req.params.id, userId: req.userId } });
    if (!existing) return res.status(404).json({ message: 'Financiamiento no encontrado' });

    const financing = await prisma.financing.update({ where: { id: req.params.id }, data: { status } });
    res.json({ financing });
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar estado', error: error.message });
  }
};

// DELETE /api/financings/:id
const deleteFinancing = async (req, res) => {
  try {
    const existing = await prisma.financing.findFirst({ where: { id: req.params.id, userId: req.userId } });
    if (!existing) return res.status(404).json({ message: 'Financiamiento no encontrado' });
    await prisma.financing.delete({ where: { id: req.params.id } });
    res.json({ message: 'Financiamiento eliminado' });
  } catch (error) {
    res.status(500).json({ message: 'Error al eliminar financiamiento', error: error.message });
  }
};

module.exports = { getFinancings, getFinancingById, calculatePreview, createFinancing, addFinancingPayment, updateFinancingStatus, deleteFinancing };
