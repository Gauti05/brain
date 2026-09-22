const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { Worker } = require('worker_threads');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});


const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, `${uuidv4()}-${file.originalname}`);
  }
});
const upload = multer({ storage });

class Task {
  constructor(processId, filePath, userId, priority, filename) {
    this.processId = processId;
    this.filePath = filePath;
    this.userId = userId;
    this.priority = priority;
    this.filename = filename;
    this.status = 'File added to queue';
    this.progress = 0;
    this.result = null;
    this.createdAt = Date.now();
  }
}

class QueueManager {
  constructor(io) {
    this.queue = [];
    this.allTasks = new Map();
    this.isProcessing = false;
    this.io = io;
  }

  addTask(task) {
    this.allTasks.set(task.processId, task);

    if (task.priority === 'high') {
      const lastHighIdx = this.queue.findLastIndex(t => t.priority === 'high');
      if (lastHighIdx !== -1) {
        this.queue.splice(lastHighIdx + 1, 0, task);
      } else {
        this.queue.unshift(task);
      }
    } else {
      this.queue.push(task);
    }

    this.updateTaskState(task.processId, 'File added to queue', 0);
    setTimeout(() => {
      if (this.allTasks.get(task.processId).status === 'File added to queue') {
        this.updateTaskState(task.processId, `Waiting for processing (ID: ${task.processId})`, 0);
      }
    }, 1000);
    this.processNext();
  }

  processNext() {
    if (this.isProcessing || this.queue.length === 0) return;

    this.isProcessing = true;
    const task = this.queue.shift();

    this.updateTaskState(task.processId, `Processing... (0%)`, 0);

    const worker = new Worker(path.join(__dirname, 'worker.js'), {
      workerData: { filePath: task.filePath }
    });


    const WORKER_TIMEOUT_MS = 60000;
    const timeoutId = setTimeout(() => {
      this.updateTaskState(task.processId, 'Error: Worker timed out (Deadlock prevented)', 0);
      worker.terminate();
      this.isProcessing = false;
      this.processNext();
    }, WORKER_TIMEOUT_MS);

    worker.on('message', (msg) => {
      if (msg.type === 'progress') {
        this.updateTaskState(task.processId, `Processing... (${msg.progress}%)`, msg.progress);
      } else if (msg.type === 'completed') {
        clearTimeout(timeoutId);
        this.updateTaskState(task.processId, 'Completed', 100, msg.result);
        this.isProcessing = false;
        this.processNext();
      } else if (msg.type === 'error') {
        clearTimeout(timeoutId);
        this.updateTaskState(task.processId, `Error: ${msg.error}`, 0);
        this.isProcessing = false;
        this.processNext();
      }
    });

    worker.on('error', (err) => {
      clearTimeout(timeoutId);
      this.updateTaskState(task.processId, `Error: ${err.message}`, 0);
      this.isProcessing = false;
      this.processNext();
    });

    worker.on('exit', (code) => {
      clearTimeout(timeoutId);
      if (code !== 0 && this.allTasks.get(task.processId).status !== 'Completed') {
        this.updateTaskState(task.processId, `Worker stopped with exit code ${code}`, 0);
        this.isProcessing = false;
        this.processNext();
      }
    });
  }

  updateTaskState(processId, status, progress, result = null) {
    const task = this.allTasks.get(processId);
    if (task) {
      task.status = status;
      task.progress = progress;
      if (result !== null) task.result = result;


      this.io.emit('queue_update', Array.from(this.allTasks.values()));
    }
  }
}

const queueManager = new QueueManager(io);

app.post('/upload', upload.single('file'), (req, res) => {
  const { priority, userId } = req.body;
  const file = req.file;

  if (!file || !userId || !priority) {
    return res.status(400).json({ error: 'File, userId, and priority are required' });
  }

  const processId = uuidv4();
  const task = new Task(processId, file.path, userId, priority, file.originalname);

  queueManager.addTask(task);

  res.status(202).json({
    message: 'File uploaded',
    processId: processId,
    priority: priority
  });
});

app.get('/queue', (req, res) => {
  res.json(Array.from(queueManager.allTasks.values()));
});

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.emit('queue_update', Array.from(queueManager.allTasks.values()));

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
