require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']); // use Google DNS for Atlas SRV resolution
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
const allowedOrigins = [
  'http://localhost:5173', 'http://localhost:5174',
  'http://127.0.0.1:5173', 'http://127.0.0.1:5174',
  process.env.FRONTEND_URL,
].filter(Boolean);
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json());

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB error:', err));

app.use('/api/auth',          require('./routes/auth'));
app.use('/api/tasks',         require('./routes/tasks'));
app.use('/api/users',         require('./routes/users'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/uploads',   require('express').static(path.join(__dirname, 'uploads')));

const PORT = process.env.PORT || 10000;

app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port " + PORT);
});
