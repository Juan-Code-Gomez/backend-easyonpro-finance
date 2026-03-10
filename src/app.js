const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// Health check
app.get('/', (req, res) => {
  res.json({ message: 'EasyOnPro Finance API running ✅', version: '1.0.0' });
});

// Routes (se irán agregando por fases)
// app.use('/api/auth', require('./routes/auth.routes'));

module.exports = app;
