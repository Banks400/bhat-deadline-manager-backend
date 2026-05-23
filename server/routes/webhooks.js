const express = require('express');
const router = express.Router();
const Deadline = require('../models/Deadline');

// ─── NEKST WEBHOOK RECEIVER ───────────────────────────────────────────────────
// Set this URL in Nekst: Settings > Webhooks > Add Webhook
// URL: https://your-backend-url.com/api/webhooks/nekst
// Events: task.completed, task.due_soon, transaction.created, transaction.status_changed
//
// Nekst sends JSON payloads like:
// { event: 'task.completed', transaction: { address, mlsNumber, fileNumber, agent, closeDate },
//   task: { name, dueDate, assignedTo, category } }

router.post('/nekst', async (req, res) => {
  try {
    const payload = req.body;
    const event = payload.event || payload.type || 'unknown';
    console.log('[Nekst Webhook] Event:', event, JSON.stringify(payload).substring(0, 200));

    // Map Nekst event types to deadline actions
    if (event.includes('task') || event.includes('deadline') || event.includes('transaction')) {
      const txn = payload.transaction || payload.deal || {};
      const task = payload.task || payload.milestone || payload;

      // Build normalized deadline from Nekst payload
      const title = task.name || task.title || txn.address || 'Nekst Task';
      const address = txn.address || txn.propertyAddress || '';
      const agent = txn.agentName || txn.agent || payload.agentName || '';
      const fileNumber = txn.fileNumber || txn.transactionId || '';
      const mlsNumber = txn.mlsNumber || txn.mls || '';
      const closePrice = txn.closePrice || txn.listPrice || '';

      // Parse due date
      const rawDate = task.dueDate || task.due_date || task.deadline || txn.closeDate || txn.close_date;
      const dueDate = rawDate ? new Date(rawDate) : new Date(Date.now() + 86400000);

      // Map Nekst task category to deadline type
      const categoryMap = {
        'closing': 'closing', 'close': 'closing',
        'loan': 'loan-docs', 'loan docs': 'loan-docs', 'loan documents': 'loan-docs',
        'inspection': 'inspection', 'home inspection': 'inspection',
        'title': 'title', 'title search': 'title',
        'compliance': 'compliance', 'mls': 'compliance',
        'appraisal': 'appraisal', 'walkthrough': 'walkthrough'
      };
      const rawCategory = (task.category || task.type || '').toLowerCase();
      const type = categoryMap[rawCategory] || 'other';

      // Map priority from Nekst urgency/priority fields
      const daysLeft = Math.ceil((dueDate - new Date()) / 86400000);
      let priority = 'medium';
      if (task.priority === 'high' || task.urgent || daysLeft <= 1) priority = 'critical';
      else if (task.priority === 'medium' || daysLeft <= 3) priority = 'high';
      else if (daysLeft <= 7) priority = 'medium';
      else priority = 'low';

      // Map team assignment
      const assignedTo = (task.assignedTo || task.assigned_to || '').toLowerCase();
      let team = 'Frontend TC';
      if (assignedTo.includes('backend') || assignedTo.includes('back')) team = 'Backend TC';
      else if (assignedTo.includes('both') || assignedTo.includes('all')) team = 'Both';

      // Handle completed tasks from Nekst
      if (event.includes('completed') || event.includes('done')) {
        // Find and mark existing deadline complete
        const existing = await Deadline.findOne({
          title: new RegExp(title.substring(0, 20), 'i'),
          status: { $ne: 'completed' }
        });
        if (existing) {
          existing.status = 'completed';
          existing.completedAt = new Date();
          await existing.save();
          console.log('[Nekst] Marked complete:', existing.title);
        }
        return res.json({ success: true, action: 'completed', title });
      }

      // Check for duplicate (same title + due date)
      const exists = await Deadline.findOne({
        title: new RegExp(title.substring(0, 15), 'i'),
        dueDate: { $gte: new Date(dueDate.getTime() - 86400000), $lte: new Date(dueDate.getTime() + 86400000) }
      });

      if (exists) {
        // Update existing instead of duplicate
        Object.assign(exists, { priority, team, type, agent, fileNumber, mlsNumber });
        await exists.save();
        console.log('[Nekst] Updated existing:', exists.title);
        return res.json({ success: true, action: 'updated', id: exists._id });
      }

      // Create new deadline from Nekst
      const deadline = new Deadline({
        title,
        dueDate,
        priority,
        team,
        type,
        status: 'pending',
        address,
        agent,
        fileNumber,
        mlsNumber,
        closePrice: String(closePrice),
        notes: task.notes || task.description || '',
        source: 'nekst',
        createdBy: 'Nekst Auto-Sync'
      });
      await deadline.save();
      console.log('[Nekst] Created deadline:', deadline.title);
      res.json({ success: true, action: 'created', id: deadline._id });
    } else {
      res.json({ success: true, action: 'ignored', event });
    }
  } catch (webhooks.jserr) {
    console.error('[Nekst Webhook Error]', err.message);
    res.status(500).json({ error: 'Webhook processing failed', details: err.message });
  }
});

// ─── GENERIC WEBHOOK (for Zapier, Make.com, etc.) ────────────────────────────
router.post('/generic', async (req, res) => {
  try {
    const { title, dueDate, priority, team, type, notes, agent, fileNumber, source } = req.body;
    if (!title || !dueDate) return res.status(400).json({ error: 'title and dueDate required' });
    const deadline = new Deadline({
      title, dueDate: new Date(dueDate),
      priority: priority || 'medium',
      team: team || 'Frontend TC',
      type: type || 'other',
      notes: notes || '',
      agent: agent || '',
      fileNumber: fileNumber || '',
      status: 'pending',
      source: source || 'webhook',
      createdBy: 'Auto-Sync'
    });
    await deadline.save();
    res.status(201).json({ success: true, id: deadline._id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
