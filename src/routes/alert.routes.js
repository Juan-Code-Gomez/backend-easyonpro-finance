const router = require('express').Router();
const auth = require('../middlewares/auth.middleware');
const {
  getAlerts, markRead, markAllRead, deleteAlert,
  getBudgets, createBudget, deleteBudget,
} = require('../controllers/alert.controller');

router.use(auth);

// Alertas
router.get('/', getAlerts);
router.patch('/read-all', markAllRead);
router.patch('/:id/read', markRead);
router.delete('/:id', deleteAlert);

// Presupuestos
router.get('/budgets', getBudgets);
router.post('/budgets', createBudget);
router.delete('/budgets/:id', deleteBudget);

module.exports = router;
