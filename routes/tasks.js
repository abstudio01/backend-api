const router       = require('express').Router();
const path         = require('path');
const fs           = require('fs');
const multer       = require('multer');
const auth         = require('../middleware/auth');
const Task         = require('../models/Task');
const User         = require('../models/User');
const Notification = require('../models/Notification');

async function notify(userId, type, message, taskId) {
  try { await Notification.create({ userId, type, message, taskId }); } catch (_) {}
}

// Multer storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../uploads')),
  filename:    (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } }); // 50 MB

// Auto-mark overdue tasks
async function checkOverdue() {
  const pending = await Task.find({ status: { $in: ['in_progress', 'revision'] } });
  const now = Date.now();
  for (const t of pending) {
    const base = t.revisionDeadlineStartedAt || t.createdAt;
    const deadline = new Date(base).getTime() +
      ((t.deadlineSeconds || (t.deadlineHours || 0) * 3600) * 1000);
    if (now > deadline) { t.status = 'overdue'; await t.save(); }
  }
}

// POST /api/tasks  (boss creates task)
router.post('/', auth, async (req, res) => {
  if (req.user.role !== 'boss') return res.status(403).json({ message: 'Bosses only' });
  try {
    if (req.body.assignedTo === 'all') {
      const employees = await User.find({ role: 'employee' }).select('_id');
      if (employees.length === 0) return res.status(400).json({ message: 'No employees found' });
      const tasksToCreate = employees.map(emp => ({
        ...req.body,
        assignedTo: emp._id,
        assignedBy: req.user.id,
      }));
      const createdTasks = await Task.insertMany(tasksToCreate);
      const populated = await Task.find({ _id: { $in: createdTasks.map(t => t._id) } })
        .populate('assignedTo', 'name email')
        .populate('assignedBy', 'name')
        .sort({ createdAt: -1 });
      for (const t of populated) {
        await notify(t.assignedTo._id, 'new_task', `New task assigned: "${t.title}"`, t._id);
      }
      return res.status(201).json(populated);
    }

    const task = await Task.create({ ...req.body, assignedBy: req.user.id });
    const populated = await task.populate('assignedTo', 'name email');
    await notify(populated.assignedTo._id, 'new_task', `New task assigned: "${populated.title}"`, populated._id);
    res.status(201).json(populated);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// PATCH /api/tasks/:id  (boss edits a task)
router.patch('/:id', auth, async (req, res) => {
  if (req.user.role !== 'boss') return res.status(403).json({ message: 'Bosses only' });
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ message: 'Task not found' });
    if (req.body.assignedTo === 'all') {
      return res.status(400).json({ message: 'Cannot reassign a single task to all employees.' });
    }
    if (req.body.title !== undefined) task.title = req.body.title;
    if (req.body.description !== undefined) task.description = req.body.description;
    if (req.body.assignedTo) task.assignedTo = req.body.assignedTo;
    if (req.body.priority) task.priority = req.body.priority;
    if (req.body.deadlineHours !== undefined) task.deadlineHours = req.body.deadlineHours;
    if (req.body.deadlineSeconds !== undefined) task.deadlineSeconds = req.body.deadlineSeconds;
    await task.save();
    await task.populate('assignedTo', 'name email');
    await task.populate('assignedBy', 'name');
    res.json(task);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// GET /api/tasks  (boss gets all tasks)
router.get('/', auth, async (req, res) => {
  if (req.user.role !== 'boss') return res.status(403).json({ message: 'Bosses only' });
  try {
    await checkOverdue();
    const tasks = await Task.find()
      .populate('assignedTo', 'name email')
      .populate('assignedBy', 'name')
      .sort({ createdAt: -1 });
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/tasks/my  (employee gets their own tasks)
router.get('/my', auth, async (req, res) => {
  try {
    await checkOverdue();
    const tasks = await Task.find({ assignedTo: req.user.id })
      .populate('assignedBy', 'name')
      .sort({ createdAt: -1 });
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/tasks/:id/status  (update task status)
router.patch('/:id/status', auth, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ message: 'Task not found' });
    if (req.user.role === 'employee' && task.assignedTo.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not your task' });
    }

    if (req.body.status === 'delivered') {
      const uploads = Array.isArray(task.uploads) ? task.uploads : [];
      const employeeUploads = uploads.filter(u => u.uploadedByRole === 'employee');
      if (employeeUploads.length === 0) {
        return res.status(400).json({ message: 'Upload a file before delivering the task.' });
      }
      const deliveryMessage = (req.body.deliveryMessage || '').trim();
      if (!deliveryMessage) {
        return res.status(400).json({ message: 'Write a message before delivering the task.' });
      }
      task.deliveryMessage = deliveryMessage;
      task.deliveredAt = new Date();
      const base = task.revisionDeadlineStartedAt || task.createdAt;
      const deadline = new Date(base).getTime() + ((task.deadlineSeconds || (task.deadlineHours || 0) * 3600)) * 1000;
      task.deliveredOnTime = Date.now() <= deadline;
    }

    task.status = req.body.status;
    if (req.body.status === 'done') {
      if (req.body.rating !== undefined)          task.rating          = req.body.rating;
      if (req.body.review !== undefined)          task.review          = req.body.review;
      if (req.body.firstGoApproval !== undefined) task.firstGoApproval = req.body.firstGoApproval;
    }
    await task.save();
    res.json(task);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// PATCH /api/tasks/:id/revision  (boss sends revision note)
router.patch('/:id/revision', auth, async (req, res) => {
  if (req.user.role !== 'boss') return res.status(403).json({ message: 'Bosses only' });
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ message: 'Task not found' });
    const note = req.body.note || '';
    task.status = 'revision';
    task.revisionNote = note;
    task.revisionCount = (task.revisionCount || 0) + 1;
    task.revisionHistory = Array.isArray(task.revisionHistory) ? task.revisionHistory : [];
    task.revisionHistory.push({ note });
    if (req.body.details !== undefined) task.description = req.body.details;
    if (req.body.deadlineHours !== undefined && req.body.deadlineSeconds !== undefined) {
      task.deadlineHours = req.body.deadlineHours;
      task.deadlineSeconds = req.body.deadlineSeconds;
      task.revisionDeadlineStartedAt = new Date();
    }
    await task.save();
    await task.populate('assignedTo', 'name email');
    await task.populate('assignedBy', 'name');
    await notify(task.assignedTo._id, 'revision', `Revision #${task.revisionCount} requested on "${task.title}"`, task._id);
    res.json(task);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// POST /api/tasks/:id/upload  (employee uploads file for a task)
router.post('/:id/upload', auth, upload.single('file'), async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ message: 'Task not found' });
    if (task.assignedTo.toString() !== req.user.id && req.user.role !== 'boss') {
      return res.status(403).json({ message: 'Not your task' });
    }
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    const fileInfo = {
      filename:     req.file.filename,
      originalname: req.file.originalname,
      mimetype:     req.file.mimetype,
      size:         req.file.size,
      uploadedByRole: req.user.role === 'boss' ? 'boss' : 'employee',
      uploadStage: req.body.uploadStage || (req.user.role === 'boss' ? 'boss_attachment' : 'delivery'),
      revisionCycle: Number(req.body.revisionCycle || 0),
    };
    task.uploads.push(fileInfo);
    await task.save();
    res.json({ upload: fileInfo, uploads: task.uploads });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/tasks/:id/upload/:filename  (boss or assigned employee can delete a file)
router.delete('/:id/upload/:filename', auth, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ message: 'Task not found' });
    if (req.user.role !== 'boss' && task.assignedTo.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    const file = task.uploads.find(u => u.filename === req.params.filename);
    if (!file) return res.status(404).json({ message: 'File not found' });

    const filePath = path.join(__dirname, '../uploads', req.params.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    task.uploads = task.uploads.filter(u => u.filename !== req.params.filename);
    await task.save();
    res.json({ message: 'File deleted', uploads: task.uploads });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/tasks/:id/download/:filename  (download a file)
router.get('/:id/download/:filename', auth, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ message: 'Task not found' });
    if (task.assignedTo.toString() !== req.user.id && req.user.role !== 'boss') {
      return res.status(403).json({ message: 'Not your task' });
    }
    const file = task.uploads.find(u => u.filename === req.params.filename);
    if (!file) return res.status(404).json({ message: 'File not found' });

    const filePath = path.join(__dirname, '../uploads', req.params.filename);
    res.download(filePath, file.originalname);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/tasks/:id  (boss deletes task)
router.delete('/:id', auth, async (req, res) => {
  if (req.user.role !== 'boss') return res.status(403).json({ message: 'Bosses only' });
  try {
    const task = await Task.findById(req.params.id);
    if (task) {
      // Delete associated files
      for (const f of task.uploads) {
        const fp = path.join(__dirname, '../uploads', f.filename);
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
      }
      await task.deleteOne();
    }
    res.json({ message: 'Task deleted' });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;
