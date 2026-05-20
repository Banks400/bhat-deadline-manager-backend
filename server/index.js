const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const cron = require('node-cron');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Database Connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
    useUnifiedTopology: true,
    }).then(() => console.log('MongoDB connected'))
      .catch(err => console.log('MongoDB connection error:', err));

      // Routes
      app.use('/api/auth', require('./routes/auth'));
      app.use('/api/deadlines', require('./routes/deadlines'));

      // Health check endpoint
      app.get('/health', (req, res) => {
        res.json({ status: 'Backend is running', timestamp: new Date() });
        });

        // Error handling middleware
        app.use((err, req, res, next) => {
          console.error(err.stack);
            res.status(500).json({ error: 'Something went wrong' });
            });

            // Start server
            const PORT = process.env.PORT || 5000;
            app.listen(PORT, () => {
              console.log(`Server running on port ${PORT}`);
              });

              module.exports = app;
