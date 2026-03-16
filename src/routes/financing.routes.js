const { Router } = require('express');
const { getFinancings, getFinancingById, calculatePreview, createFinancing, addFinancingPayment, updateFinancingStatus, deleteFinancing } = require('../controllers/financing.controller');
const authMiddleware = require('../middlewares/auth.middleware');

const router = Router();
router.use(authMiddleware);

router.post('/calculate', calculatePreview);
router.get('/', getFinancings);
router.get('/:id', getFinancingById);
router.post('/', createFinancing);
router.post('/:id/payments', addFinancingPayment);
router.put('/:id/status', updateFinancingStatus);
router.delete('/:id', deleteFinancing);

module.exports = router;
