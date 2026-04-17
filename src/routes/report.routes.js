const router = require('express').Router();
const auth = require('../middlewares/auth.middleware');
const { getMonthlyReport, getYearlyReport } = require('../controllers/report.controller');

router.use(auth);
router.get('/monthly', getMonthlyReport);
router.get('/yearly', getYearlyReport);

module.exports = router;
