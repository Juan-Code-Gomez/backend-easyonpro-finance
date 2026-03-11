const { Router } = require('express');
const { getCategories, createCategory, deleteCategory } = require('../controllers/category.controller');
const authMiddleware = require('../middlewares/auth.middleware');

const router = Router();
router.use(authMiddleware);

router.get('/', getCategories);
router.post('/', createCategory);
router.delete('/:id', deleteCategory);

module.exports = router;
