const router = require('express').Router();
const auth = require('../middleware/auth');
const Notification = require('../models/Notification');

// GET /api/notifications  — get my notifications (latest 30)
router.get('/', auth, async (req, res) => {
  try {
    const notes = await Notification.find({ userId: req.user.id })
      .sort({ createdAt: -1 }).limit(30);
    res.json(notes);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/notifications/:id/read
router.patch('/:id/read', auth, async (req, res) => {
  try {
    await Notification.findOneAndUpdate({ _id: req.params.id, userId: req.user.id }, { read: true });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/notifications/read-all
router.patch('/read-all', auth, async (req, res) => {
  try {
    await Notification.updateMany({ userId: req.user.id, read: false }, { read: true });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
