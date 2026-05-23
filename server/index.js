const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Database Connection
if(process.env.MONGODB_URI){
  mongoose.connect(process.env.MONGODB_URI,{
    useNewUrlParser:true,
    useUnifiedTopology:true,
  }).then(()=>console.log('MongoDB connected'))
  .catch(err=>console.log('MongoDB connection error:',err.message));
} else {
  console.log('No MONGODB_URI set — running with in-memory fallback');
}

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/deadlines', require('./routes/deadlines'));
app.use('/api/webhooks', require('./routes/webhooks'));

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'BHAT Backend running',
    timestamp: new Date(),
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    webhooks: {
      nekst: '/api/webhooks/nekst',
      generic: '/api/webhooks/generic'
    }
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('BHAT Backend running on port '+PORT);
  console.log('Webhook endpoints:');
  console.log('  Nekst:   POST /api/webhooks/nekst');
  console.log('  Generic: POST /api/webhooks/generic');
});

module.exports = app;
