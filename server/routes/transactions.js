const express = require('express');
const router = express.Router();
const { Transaction, Queue } = require('../models/Transaction');

// GET all active transactions (optionally filter by TC)
router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.assignedTo) filter.assignedTo = req.query.assignedTo;
    if (req.query.team) filter.tcTeam = req.query.team;
    if (req.query.status) filter.status = req.query.status;
    else filter.status = { $ne: 'closed' };
    const txns = await Transaction.find(filter).sort({ createdAt: -1 });
    res.json(txns);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET workload summary per TC (for status board)
router.get('/workload', async (req, res) => {
  try {
    const active = await Transaction.find({ status: { $ne: 'closed' } });
    const now = new Date();
    const summary = {};
    for (const t of active) {
      if (!summary[t.assignedTo]) {
        summary[t.assignedTo] = {
          userId: t.assignedTo,
          name: t.assignedName,
          team: t.tcTeam,
          total: 0,
          urgent: 0,
          closingThisWeek: 0,
          pendingClose: 0
        };
      }
      const s = summary[t.assignedTo];
      s.total++;
      if (t.closeDate) {
        const days = Math.ceil((new Date(t.closeDate) - now) / 86400000);
        if (days <= 7 && days >= 0) s.closingThisWeek++;
        if (days <= 2 && days >= 0) s.urgent++;
      }
      if (t.status === 'pending-close') s.pendingClose++;
    }
    res.json(Object.values(summary));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET queue state
router.get('/queue/:team', async (req, res) => {
  try {
    const team = decodeURIComponent(req.params.team);
    const queue = await Queue.findOne({ team });
    if (!queue) return res.json({ members: [], currentIndex: 0, nextUp: null });
    const nextUp = queue.peekNext();
    res.json({ members: queue.members, currentIndex: queue.currentIndex, nextUp, totalAssigned: queue.totalAssigned });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST create new transaction + auto-assign via rotation
router.post('/', async (req, res) => {
  try {
    const { address, tcTeam, closeDate, agent, mlsNumber, fileNumber, closePrice, notes, addedBy, guildId } = req.body;
    if (!address || !tcTeam) return res.status(400).json({ error: 'address and tcTeam required' });
    const gid = guildId || process.env.GUILD_ID;
    // Get or create queue for this team
    let queue = await Queue.findOne({ guildId: gid, team: tcTeam });
    if (!queue || !queue.members.length) {
      return res.status(400).json({ error: 'No TC members registered for '+tcTeam+'. Use /tc register first.' });
    }
    // Get next TC in rotation
    const assignee = queue.getNext();
    await queue.save();
    // Create transaction
    const txn = new Transaction({
      address, tcTeam, agent: agent||'', mlsNumber: mlsNumber||'',
      fileNumber: fileNumber||'', closePrice: closePrice||'',
      closeDate: closeDate ? new Date(closeDate) : null,
      notes: notes||'', addedBy: addedBy||'',
      assignedTo: assignee.userId,
      assignedName: assignee.username,
      status: 'active', stage: 'new-contract', source: 'manual'
    });
    await txn.save();
    res.status(201).json({ transaction: txn, assignedTo: assignee });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT update transaction status/stage
router.put('/:id', async (req, res) => {
  try {
    const txn = await Transaction.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!txn) return res.status(404).json({ error: 'Not found' });
    res.json(txn);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// POST register TC member to a queue
router.post('/queue/register', async (req, res) => {
  try {
    const { guildId, team, userId, username, displayName } = req.body;
    if (!guildId || !team || !userId) return res.status(400).json({ error: 'guildId, team, userId required' });
    let queue = await Queue.findOne({ guildId, team });
    if (!queue) queue = new Queue({ guildId, team, members: [], currentIndex: 0 });
    const exists = queue.members.find(m => m.userId === userId);
    if (!exists) queue.members.push({ userId, username, displayName: displayName||username });
    await queue.save();
    res.json({ success: true, queue });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE remove TC from queue
router.delete('/queue/:team/:userId', async (req, res) => {
  try {
    const queue = await Queue.findOne({ team: decodeURIComponent(req.params.team) });
    if (!queue) return res.status(404).json({ error: 'Queue not found' });
    queue.members = queue.members.filter(m => m.userId !== req.params.userId);
    if (queue.currentIndex >= queue.members.length) queue.currentIndex = 0;
    await queue.save();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
