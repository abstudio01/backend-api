const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
  title:        { type: String, required: true, trim: true },
  description:  { type: String, default: '' },
  assignedTo:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  assignedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  deadlineHours:{ type: Number, required: true, min: 0 },
  deadlineSeconds:{ type: Number, min: 1 },
  priority:     { type: String, enum: ['normal', 'high', 'urgent'], default: 'normal' },
  status:       { type: String, enum: ['in_progress', 'delivered', 'revision', 'done', 'overdue', 'cancelled'], default: 'in_progress' },
  cancelReason: { type: String, default: '' },
  cancelledAt:  { type: Date, default: null },
  revisionNote: { type: String, default: '' },
  revisionCount: { type: Number, default: 0 },
  revisionHistory: [{
    note: String,
    createdAt: { type: Date, default: Date.now },
  }],
  revisionDeadlineStartedAt: { type: Date, default: null },
  deliveryMessage: { type: String, default: '' },
  deliveredAt:     { type: Date, default: null },
  deliveredOnTime: { type: Boolean, default: null },
  rating:          { type: Number, min: 1, max: 5, default: null },
  review:          { type: String, default: '' },
  firstGoApproval: { type: Boolean, default: false },
  uploads: [{
    filename:     String,
    originalname: String,
    mimetype:     String,
    size:         Number,
    uploadedByRole: { type: String, enum: ['boss', 'employee'], default: 'employee' },
    uploadStage: { type: String, default: '' },
    revisionCycle: { type: Number, default: 0 },
    uploadedAt:   { type: Date, default: Date.now },
  }],
}, { timestamps: true });

module.exports = mongoose.model('Task', taskSchema);
