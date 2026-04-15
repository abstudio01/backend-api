const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  userId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type:    { type: String, enum: ['new_task', 'revision', 'approved', 'cancelled', 'deadline_warning'], required: true },
  message: { type: String, required: true },
  taskId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null },
  read:    { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Notification', notificationSchema);
