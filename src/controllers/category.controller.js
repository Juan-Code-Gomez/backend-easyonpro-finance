const prisma = require('../prisma');

// Categorías predeterminadas que se crean al primer uso
const DEFAULT_CATEGORIES = [
  { name: 'Salario', icon: '💼', color: '#10B981', type: 'INCOME' },
  { name: 'Freelance', icon: '💻', color: '#6366F1', type: 'INCOME' },
  { name: 'Inversiones', icon: '📈', color: '#F59E0B', type: 'INCOME' },
  { name: 'Otros ingresos', icon: '💰', color: '#14B8A6', type: 'INCOME' },
  { name: 'Alimentación', icon: '🍔', color: '#EF4444', type: 'EXPENSE' },
  { name: 'Transporte', icon: '🚗', color: '#F97316', type: 'EXPENSE' },
  { name: 'Vivienda', icon: '🏠', color: '#8B5CF6', type: 'EXPENSE' },
  { name: 'Salud', icon: '❤️', color: '#EC4899', type: 'EXPENSE' },
  { name: 'Entretenimiento', icon: '🎮', color: '#3B82F6', type: 'EXPENSE' },
  { name: 'Ropa', icon: '👕', color: '#84CC16', type: 'EXPENSE' },
  { name: 'Educación', icon: '📚', color: '#06B6D4', type: 'EXPENSE' },
  { name: 'Servicios', icon: '💡', color: '#D97706', type: 'EXPENSE' },
  { name: 'Otros gastos', icon: '📦', color: '#6B7280', type: 'EXPENSE' },
];

const seedDefaultCategories = async (userId) => {
  const existing = await prisma.category.count({ where: { userId } });
  if (existing === 0) {
    await prisma.category.createMany({
      data: DEFAULT_CATEGORIES.map((c) => ({ ...c, userId })),
      skipDuplicates: true,
    });
  }
};

// GET /api/categories
const getCategories = async (req, res) => {
  try {
    await seedDefaultCategories(req.userId);
    const { type } = req.query;
    const where = { userId: req.userId };
    if (type) where.type = type.toUpperCase();

    const categories = await prisma.category.findMany({
      where,
      orderBy: { name: 'asc' },
    });
    res.json({ categories });
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener categorías', error: error.message });
  }
};

// POST /api/categories
const createCategory = async (req, res) => {
  try {
    const { name, icon, color, type } = req.body;
    if (!name || !type) return res.status(400).json({ message: 'Nombre y tipo son requeridos' });
    if (!['INCOME', 'EXPENSE'].includes(type.toUpperCase()))
      return res.status(400).json({ message: 'Tipo debe ser INCOME o EXPENSE' });

    const category = await prisma.category.create({
      data: { name, icon: icon || '📦', color: color || '#6B7280', type: type.toUpperCase(), userId: req.userId },
    });
    res.status(201).json({ category });
  } catch (error) {
    if (error.code === 'P2002')
      return res.status(409).json({ message: 'Ya existe una categoría con ese nombre' });
    res.status(500).json({ message: 'Error al crear categoría', error: error.message });
  }
};

// DELETE /api/categories/:id
const deleteCategory = async (req, res) => {
  try {
    const category = await prisma.category.findFirst({ where: { id: req.params.id, userId: req.userId } });
    if (!category) return res.status(404).json({ message: 'Categoría no encontrada' });

    await prisma.category.delete({ where: { id: req.params.id } });
    res.json({ message: 'Categoría eliminada' });
  } catch (error) {
    res.status(500).json({ message: 'Error al eliminar categoría', error: error.message });
  }
};

module.exports = { getCategories, createCategory, deleteCategory };
