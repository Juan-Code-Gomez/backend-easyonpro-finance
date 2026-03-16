const { Router } = require('express');
const { getDebts, createDebt, addDebtPayment, updateDebt, deleteDebt } = require('../controllers/debt.controller');
const authMiddleware = require('../middlewares/auth.middleware');

const router = Router();
router.use(authMiddleware);

router.get('/', getDebts);
router.post('/', createDebt);
router.post('/:id/payments', addDebtPayment);
router.put('/:id', updateDebt);
router.delete('/:id', deleteDebt);

module.exports = router;
