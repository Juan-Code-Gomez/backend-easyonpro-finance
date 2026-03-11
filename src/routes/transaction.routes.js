const { Router } = require('express');
const { getTransactions, getSummary, createTransaction, updateTransaction, deleteTransaction } = require('../controllers/transaction.controller');
const authMiddleware = require('../middlewares/auth.middleware');

const router = Router();
router.use(authMiddleware);

router.get('/summary', getSummary);
router.get('/', getTransactions);
router.post('/', createTransaction);
router.put('/:id', updateTransaction);
router.delete('/:id', deleteTransaction);

module.exports = router;
