const mongoose = require('mongoose');

// ─── TRANSACTION MODEL ───────────────────────────────────────────────────────
// Represents a real estate transaction assigned to a TC
const transactionSchema = new mongoose.Schema({
  // Property info
  address:      { type: String, required: true, trim: true },
  mlsNumber:    { type: String, default: '' },
  fileNumber:   { type: String, default: '' },
  agent:        { type: String, default: '' },
  closePrice:   { type: String, default: '' },
  closeDate:    { type: Date },

  // Assignment
  assignedTo:   { type: String, required: true },  // Discord user ID
  assignedName: { type: String, default: '' },     // Discord username
  tcTeam:       { type: String, enum: ['Frontend TC','Backend TC'], required: true },

  // Status
  status: {
    type: String,
    enum: ['active','pending-close','closed','cancelled'],
    default: 'active'
  },
  stage: {
    type: String,
    enum: ['new-contract','setup','active-management','pre-closing','closing','post-close'],
    default: 'new-contract'
  },

  // Tracking
  addedBy:      { type: String, default: '' },  // Discord user who ran /transaction new
  notes:        { type: String, default: '' },
  source:       { type: String, default: 'manual' },  // 'manual' or 'nekst'
  closedAt:     { type: Date }
}, { timestamps: true });

// Virtual: is this transaction urgent (closing within 7 days)
transactionSchema.virtual('isUrgent').get(function() {
  if (!this.closeDate) return false;
  return Math.ceil((this.closeDate - new Date()) / 86400000) <= 7;
});

module.exports = mongoose.model('Transaction', transactionSchema);


// ─── QUEUE MODEL ─────────────────────────────────────────────────────────────
// Tracks rotation state for Frontend TC and Backend TC queues separately
const queueSchema = new mongoose.Schema({
  guildId:      { type: String, required: true },
  team:         { type: String, enum: ['Frontend TC','Backend TC'], required: true },
  members:      [{ userId: String, username: String, displayName: String }],
  currentIndex: { type: Number, default: 0 },  // whose turn it is
  totalAssigned:{ type: Number, default: 0 }   // running count of assignments
}, { timestamps: true });

// Get next TC in rotation and advance the pointer
queueSchema.methods.getNext = function() {
  if (!this.members.length) return null;
  const member = this.members[this.currentIndex % this.members.length];
  this.currentIndex = (this.currentIndex + 1) % this.members.length;
  this.totalAssigned += 1;
  return member;
};

// Peek at who is next without advancing
queueSchema.methods.peekNext = function() {
  if (!this.members.length) return null;
  return this.members[this.currentIndex % this.members.length];
};

module.exports.Queue = mongoose.model('Queue', queueSchema);
module.exports.Transaction = mongoose.model('Transaction', transactionSchema);
