const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

if(process.env.MONGODB_URI){
  mongoose.connect(process.env.MONGODB_URI,{useNewUrlParser:true,useUnifiedTopology:true})
    .then(()=>console.log('MongoDB connected'))
    .catch(err=>console.log('MongoDB error:',err.message));
} else {
  console.log('No MONGODB_URI set');
}

app.use('/api/auth', require('./routes/auth'));
app.use('/api/deadlines', require('./routes/deadlines'));
app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/webhooks', require('./routes/webhooks'));

app.get('/health', (req, res) => {
  res.json({
    status: 'BHAT Backend running',
    timestamp: new Date(),
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    endpoints: {
      deadlines: '/api/deadlines',
      transactions: '/api/transactions',
      webhooks: { nekst: '/api/webhooks/nekst', generic: '/api/webhooks/generic' }
    }
  });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('BHAT Backend on port '+PORT);
  console.log('Routes: /api/deadlines | /api/transactions | /api/webhooks');
});

module.exports = app;
