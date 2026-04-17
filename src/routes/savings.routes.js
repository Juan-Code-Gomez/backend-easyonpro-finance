const router = require('express').Router();
const auth = require('../middlewares/auth.middleware');
const {
  getSavingsGoals,
  getSavingsGoalById,
  createSavingsGoal,
  addDeposit,
  updateSavingsGoal,
  deleteSavingsGoal,
} = require('../controllers/savings.controller');

router.use(auth);

router.get('/', getSavingsGoals);
router.get('/:id', getSavingsGoalById);
router.post('/', createSavingsGoal);
router.post('/:id/deposits', addDeposit);
router.put('/:id', updateSavingsGoal);
router.delete('/:id', deleteSavingsGoal);

module.exports = router;
