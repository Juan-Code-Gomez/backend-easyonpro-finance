const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// Health check
app.get('/', (req, res) => {
  res.json({ message: 'EasyOnPro Finance API running ✅', version: '1.0.0' });
});

// Routes
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/categories', require('./routes/category.routes'));
app.use('/api/transactions', require('./routes/transaction.routes'));
app.use('/api/debts', require('./routes/debt.routes'));
app.use('/api/financings', require('./routes/financing.routes'));
app.use('/api/savings', require('./routes/savings.routes'));
app.use('/api/alerts', require('./routes/alert.routes'));
app.use('/api/reports', require('./routes/report.routes'));

module.exports = app;
