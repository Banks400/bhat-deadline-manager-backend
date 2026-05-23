const mongoose = require('mongoose');

const deadlineSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  dueDate: { type: Date, required: true },
  priority: { type: String, enum: ['critical', 'high', 'medium', 'low'], default: 'medium' },
  team: { type: String, enum: ['Frontend TC', 'Backend TC', 'Both'], default: 'Frontend TC' },
  status: { type: String, enum: ['pending', 'in-progress', 'completed'], default: 'pending' },
  type: { type: String, enum: ['closing', 'loan-docs', 'inspection', 'title', 'compliance', 'other'], default: 'other' },
  notes: { type: String, default: '' },
  createdBy: { type: String, default: '' },
  completedAt: { type: Date }
}, { timestamps: true });

// Auto-set completedAt when status changes to completed
deadlineSchema.pre('save', function(next) {
  if (this.isModified('status') && this.status === 'completed' && !this.completedAt) {
    this.completedAt = new Date();
  }
  next();
});

deadlineSchema.pre('findOneAndUpdate', function(next) {
  const update = this.getUpdate();
  if (update && update.status === 'completed') {
    update.completedAt = new Date();
  }
  next();
});

// Virtual: is overdue
deadlineSchema.virtual('isOverdue').get(function() {
  return this.status !== 'completed' && this.dueDate < new Date();
});

// Virtual: days until due
deadlineSchema.virtual('daysUntilDue').get(function() {
  return Math.ceil((this.dueDate - new Date()) / 86400000);
});

module.exports = mongoose.model('Deadline', deadlineSchema);
