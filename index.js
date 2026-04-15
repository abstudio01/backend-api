require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']); // use Google DNS for Atlas SRV resolution
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
const allowedOrigins = [
  'http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175',
  'http://127.0.0.1:5173', 'http://127.0.0.1:5174', 'http://127.0.0.1:5175',
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

// Deadline warning: notify boss 1 hour before task deadline
async function checkDeadlineWarnings() {
  try {
    const Task         = require('./models/Task');
    const User         = require('./models/User');
    const Notification = require('./models/Notification');
    const now   = Date.now();
    const oneHr = 60 * 60 * 1000;
    const tasks = await Task.find({ status: { $in: ['in_progress', 'revision'] } });
    const bosses = await User.find({ role: 'boss' }).select('_id');
    for (const task of tasks) {
      const base     = task.revisionDeadlineStartedAt || task.createdAt;
      const deadline = new Date(base).getTime() + (task.deadlineSeconds || (task.deadlineHours || 0) * 3600) * 1000;
      const timeLeft = deadline - now;
      if (timeLeft > 0 && timeLeft <= oneHr) {
        // Only send once — check if warning already exists for this task
        const already = await Notification.findOne({ taskId: task._id, type: 'deadline_warning' });
        if (!already) {
          const mins = Math.round(timeLeft / 60000);
          for (const boss of bosses) {
            await Notification.create({
              userId:  boss._id,
              type:    'deadline_warning',
              message: `⏰ "${task.title}" deadline in ~${mins} min`,
              taskId:  task._id,
            });
          }
        }
      }
    }
  } catch (err) {
    console.error('Deadline warning check error:', err.message);
  }
}
setInterval(checkDeadlineWarnings, 5 * 60 * 1000); // check every 5 minutes

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
