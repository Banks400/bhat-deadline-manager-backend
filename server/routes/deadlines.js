const express = require('express');
const router = express.Router();
const Deadline = require('../models/Deadline');

// GET all deadlines (with optional filters)
router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.team) filter.team = req.query.team;
    if (req.query.priority) filter.priority = req.query.priority;
    if (req.query.status) filter.status = req.query.status;
    const deadlines = await Deadline.find(filter).sort({ dueDate: 1 });
    res.json(deadlines);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch deadlines', details: err.message });
  }
});

// GET single deadline
router.get('/:id', async (req, res) => {
  try {
    const deadline = await Deadline.findById(req.params.id);
    if (!deadline) return res.status(404).json({ error: 'Not found' });
    res.json(deadline);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch deadline', details: err.message });
  }
});

// POST create new deadline
router.post('/', async (req, res) => {
  try {
    const deadline = new Deadline(req.body);
    await deadline.save();
    res.status(201).json(deadline);
  } catch (err) {
    res.status(400).json({ error: 'Failed to create deadline', details: err.message });
  }
});

// PUT update deadline
router.put('/:id', async (req, res) => {
  try {
    const deadline = await Deadline.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!deadline) return res.status(404).json({ error: 'Not found' });
    res.json(deadline);
  } catch (err) {
    res.status(400).json({ error: 'Failed to update deadline', details: err.message });
  }
});

// DELETE deadline
router.delete('/:id', async (req, res) => {
  try {
    const deadline = await Deadline.findByIdAndDelete(req.params.id);
    if (!deadline) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted', id: req.params.id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete deadline', details: err.message });
  }
});

module.exports = router;
