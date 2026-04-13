const router = require('express').Router();
const auth   = require('../middleware/auth');
const User   = require('../models/User');

// GET /api/users/employees  (boss only)
router.get('/employees', auth, async (req, res) => {
  if (req.user.role !== 'boss') return res.status(403).json({ message: 'Bosses only' });
  try {
    const employees = await User.find({ role: 'employee' }).select('_id name email attendance');
    res.json(employees);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/users/my-attendance  (employee gets own attendance)
router.get('/my-attendance', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('attendance');
    res.json(user.attendance || []);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/users/checkin  (employee checks in)
router.post('/checkin', auth, async (req, res) => {
  if (req.user.role !== 'employee') return res.status(403).json({ message: 'Employees only' });
  try {
    const today = new Date().toISOString().slice(0, 10);
    const user  = await User.findById(req.user.id);
    const existing = user.attendance.find(a => a.date === today);
    if (existing) return res.status(400).json({ message: 'Already checked in today' });
    user.attendance.push({ date: today, checkIn: Date.now(), checkOut: null });
    await user.save();
    res.json(user.attendance);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/users/checkout  (employee checks out)
router.post('/checkout', auth, async (req, res) => {
  if (req.user.role !== 'employee') return res.status(403).json({ message: 'Employees only' });
  try {
    const today = new Date().toISOString().slice(0, 10);
    const user  = await User.findById(req.user.id);
    const rec   = user.attendance.find(a => a.date === today);
    if (!rec) return res.status(400).json({ message: 'Not checked in today' });
    if (rec.checkOut) return res.status(400).json({ message: 'Already checked out' });
    rec.checkOut = Date.now();
    await user.save();
    res.json(user.attendance);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
