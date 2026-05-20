const express = require('express');
const router = express.Router();
let deadlines = [
  { id: 1, title: 'Q1 Deadline', dueDate: '2026-03-31', priority: 'high', team: 'Frontend TC', status: 'pending' },
  { id: 2, title: 'Backend API', dueDate: '2026-04-15', priority: 'critical', team: 'Backend TC', status: 'in-progress' }
  ];
router.get('/', (req, res) => res.json(deadlines));
router.get('/:id', (req, res) => {
    const deadline = deadlines.find(d => d.id === parseInt(req.params.id));
    res.json(deadline || { error: 'Not found' });
});
router.post('/', (req, res) => {
    const newDeadline = {
          id: deadlines.length ? Math.max(...deadlines.map(d => d.id)) + 1 : 1,
          ...req.body,
                status: 'pending',
          createdAt: new Date()
    };
    deadlines.push(newDeadline);
    res.status(201).json(newDeadline);
});
router.put('/:id', (req, res) => {
    const deadline = deadlines.find(d => d.id === parseInt(req.params.id));
    if (deadline) Object.assign(deadline, req.body);
    res.json(deadline || { error: 'Not found' });
});
router.delete('/:id', (req, res) => {
    deadlines = deadlines.filter(d => d.id !== parseInt(req.params.id));
    res.json({ message: 'Deleted' });
});
module.exports = router;
