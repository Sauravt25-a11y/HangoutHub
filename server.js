import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import Room from './Room.js';
import User from './user.js';
import cors from 'cors';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import jwt from 'jsonwebtoken';
import os from 'os';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

// Create HTTP server
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  maxHttpBufferSize: 1e8
});

// Create uploads directory
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, `${uuidv4()}-${file.originalname}`)
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024, files: 10 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'image/', 'video/', 'audio/', 'application/pdf',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/', 'application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed'
    ];
    const isAllowed = allowedTypes.some(type => file.mimetype.startsWith(type));
    cb(isAllowed ? null : new Error('File type not allowed'), isAllowed);
  }
});

// Connect to MongoDB
const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://localhost:27017/hangouthub';
mongoose.connect(MONGODB_URL)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// Session configuration (simplified)
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-this-in-production',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: MONGODB_URL,
    touchAfter: 24 * 3600
  }),
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 7 // 7 days
  }
}));

// Middleware
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadsDir));

// Simple login route (replaces Google OAuth)
app.post('/auth/login', async (req, res) => {
  try {
    const { name, email } = req.body;
    
    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }

    // Find or create user
    let user = await User.findOne({ email });
    if (!user) {
      user = new User({
        name,
        email,
        picture: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=3B82F6&color=fff`,
        lastLogin: new Date()
      });
      await user.save();
    } else {
      user.lastLogin = new Date();
      await user.save();
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_SECRET || 'your-jwt-secret',
      { expiresIn: '7d' }
    );

    // Store user in session
    req.session.userId = user._id;
    
    res.json({ 
      success: true, 
      token, 
      user: user.getPublicProfile() 
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Authentication middleware (modified for simple auth)
const requireAuth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-jwt-secret');
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

app.post('/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: 'Session destroy failed' });
    res.json({ success: true });
  });
});

app.get('/auth/user', requireAuth, (req, res) => {
  res.json({ user: req.user.getPublicProfile() });
});

// Main route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// File upload endpoint
app.post('/api/upload/:roomCode', requireAuth, upload.array('files', 10), async (req, res) => {
  try {
    const { roomCode } = req.params;
    const userName = req.user.name;

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const room = await Room.findOne({ code: roomCode });
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const uploadedFiles = req.files.map(file => ({
      id: uuidv4(),
      originalName: file.originalname,
      fileName: file.filename,
      size: file.size,
      mimetype: file.mimetype,
      uploadedBy: userName,
      uploadedAt: new Date(),
      downloadUrl: `/uploads/${file.filename}`
    }));

    room.sharedFiles.push(...uploadedFiles);
    await room.save();

    uploadedFiles.forEach(fileInfo => {
      io.in(roomCode).emit('file-uploaded', {
        file: fileInfo,
        message: `${userName} shared a file: ${fileInfo.originalName}`
      });
    });

    res.json({
      success: true,
      files: uploadedFiles,
      message: `${uploadedFiles.length} file(s) uploaded successfully`
    });

  } catch (error) {
    console.error('File upload error:', error);
    res.status(500).json({ error: 'File upload failed' });
  }
});

// Get room files endpoint
app.get('/api/files/:roomCode', requireAuth, async (req, res) => {
  try {
    const { roomCode } = req.params;
    const room = await Room.findOne({ code: roomCode });

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    res.json({ files: room.sharedFiles || [] });
  } catch (error) {
    console.error('Get files error:', error);
    res.status(500).json({ error: 'Failed to get files' });
  }
});

// Delete file endpoint
app.delete('/api/files/:roomCode/:fileId', requireAuth, async (req, res) => {
  try {
    const { roomCode, fileId } = req.params;
    const userName = req.user.name;

    const room = await Room.findOne({ code: roomCode });
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const fileIndex = room.sharedFiles.findIndex(f => f.id === fileId);
    if (fileIndex === -1) {
      return res.status(404).json({ error: 'File not found' });
    }

    const file = room.sharedFiles[fileIndex];
    if (file.uploadedBy !== userName && room.hostName !== userName) {
      return res.status(403).json({ error: 'Not authorized to delete this file' });
    }

    // Remove file from disk
    const filePath = path.join(uploadsDir, file.fileName);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    room.sharedFiles.splice(fileIndex, 1);
    await room.save();

    io.in(roomCode).emit('file-deleted', {
      fileId: fileId,
      fileName: file.originalName,
      message: `${userName} removed ${file.originalName}`
    });

    res.json({ success: true, message: 'File deleted successfully' });
  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

// Socket.IO authentication middleware (modified)
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error('Authentication token required'));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-jwt-secret');
    User.findById(decoded.userId).then(user => {
      if (!user) {
        return next(new Error('User not found'));
      }
      socket.user = user;
      next();
    }).catch(err => {
      next(new Error('Authentication failed'));
    });
  } catch (err) {
    next(new Error('Invalid token'));
  }
});

// Helper to fetch participants
async function getParticipantsData(roomCode) {
  const sockets = await io.in(roomCode).fetchSockets();
  return sockets.map(s => ({
    id: s.id,
    name: s.user?.name ?? 'Guest',
    picture: s.user?.picture
  }));
}

// Socket.IO connection handling (rest remains the same)
io.on('connection', socket => {
  console.log(`User connected: ${socket.user.name} (${socket.id})`);

  socket.on('create-room', async ({ hostProfile }) => {
    try {
      const room = new Room({
        hostName: socket.user.name,
        hostProfile: socket.user.getPublicProfile(),
        admissionRequired: true,
        waitingList: [],
        sharedFiles: []
      });
      await room.save();

      socket.join(room.code);
      io.to(socket.id).emit('room-created', {
        roomCode: room.code,
        room,
        hostUser: { id: socket.id, ...socket.user.getPublicProfile() }
      });

      console.log(`Room ${room.code} created by ${socket.user.name}`);
    } catch (err) {
      console.error('Error creating room:', err);
      socket.emit('error', { message: 'Failed to create room' });
    }
  });

  socket.on('join-room', async ({ roomCode }) => {
    try {
      if (!roomCode || roomCode.length !== 6) {
        socket.emit('error', { message: 'Room code must be exactly 6 characters' });
        return;
      }

      const room = await Room.findOne({ code: roomCode });
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }

      // Check if user is the host
      if (room.hostName === socket.user.name) {
        socket.join(room.code);
        const participants = await getParticipantsData(room.code);
        io.to(socket.id).emit('room-joined', {
          room,
          user: { id: socket.id, ...socket.user.getPublicProfile() },
          participants: participants.filter(p => p.id !== socket.id)
        });
        socket.to(room.code).emit('user-joined', {
          id: socket.id,
          ...socket.user.getPublicProfile()
        });
      } else {
        // Non-host users need admission
        room.waitingList.push({
          id: socket.id,
          name: socket.user.name,
          profile: socket.user.getPublicProfile()
        });
        await room.save();

        // Notify existing room members
        const roomSockets = await io.in(room.code).fetchSockets();
        roomSockets.forEach(s => {
          io.to(s.id).emit('admission-request', {
            roomCode,
            user: { id: socket.id, ...socket.user.getPublicProfile() },
            waitingCount: room.waitingList.length
          });
        });

        io.to(socket.id).emit('waiting-for-admission', {
          room,
          user: { id: socket.id, ...socket.user.getPublicProfile() },
          message: `Waiting for ${room.hostName} to admit you...`
        });

        console.log(`${socket.user.name} is waiting for admission to room ${roomCode}`);
      }
    } catch (err) {
      console.error('Error joining room:', err);
      socket.emit('error', { message: 'Failed to join room' });
    }
  });

  // ... [Rest of the socket handlers remain the same - admit-user, admit-all, send-message, signal, disconnect]
  
  socket.on('admit-user', async ({ roomCode, userId, admit }) => {
    try {
      const room = await Room.findOne({ code: roomCode });
      if (!room) return;

      const waitingUser = room.waitingList.find(u => u.id === userId);
      room.waitingList = room.waitingList.filter(u => u.id !== userId);
      await room.save();

      if (admit && waitingUser) {
        const admittedSocket = io.sockets.sockets.get(userId);
        if (admittedSocket) {
          admittedSocket.join(roomCode);
          const participants = await getParticipantsData(roomCode);
          io.to(userId).emit('room-joined', {
            room,
            user: { id: userId, ...admittedSocket.user.getPublicProfile() },
            participants: participants.filter(p => p.id !== userId)
          });
          io.in(roomCode).emit('user-joined', {
            id: userId,
            ...admittedSocket.user.getPublicProfile()
          });
          console.log(`${waitingUser.name} admitted to room ${roomCode}`);
        }
      } else {
        io.to(userId).emit('admission-rejected', {
          roomCode,
          message: `${room.hostName} declined your request to join`
        });
      }

      // Update waiting count
      const roomSockets = await io.in(roomCode).fetchSockets();
      roomSockets.forEach(s => {
        io.to(s.id).emit('waiting-list-updated', {
          count: room.waitingList.length,
          waitingList: room.waitingList
        });
      });
    } catch (err) {
      console.error('Error admitting user:', err);
    }
  });

  socket.on('admit-all', async ({ roomCode }) => {
    try {
      const room = await Room.findOne({ code: roomCode });
      if (!room) return;

      const waitingUsers = [...room.waitingList];
      room.waitingList = [];
      await room.save();

      for (const user of waitingUsers) {
        const userSocket = io.sockets.sockets.get(user.id);
        if (userSocket) {
          userSocket.join(roomCode);
          const participants = await getParticipantsData(roomCode);
          io.to(user.id).emit('room-joined', {
            room,
            user: { id: user.id, ...userSocket.user.getPublicProfile() },
            participants: participants.filter(p => p.id !== user.id)
          });
          io.in(roomCode).emit('user-joined', {
            id: user.id,
            ...userSocket.user.getPublicProfile()
          });
        }
      }

      console.log(`Admitted ${waitingUsers.length} users to room ${roomCode}`);
      const roomSockets = await io.in(roomCode).fetchSockets();
      roomSockets.forEach(s => {
        io.to(s.id).emit('waiting-list-updated', {
          count: 0,
          waitingList: []
        });
      });
    } catch (err) {
      console.error('Error admitting all users:', err);
    }
  });

  socket.on('send-message', async ({ roomCode, message }) => {
    try {
      const room = await Room.findOne({ code: roomCode });
      if (!room) return;

      const messageData = {
        sender: socket.user.name,
        message,
        timestamp: new Date(),
        senderPicture: socket.user.picture
      };

      room.messages.push(messageData);
      await room.save();
      io.in(roomCode).emit('new-message', messageData);
    } catch (err) {
      console.error('Error sending message:', err);
    }
  });

  socket.on('signal', ({ to, description, candidate }) => {
    socket.to(to).emit('signal', {
      from: socket.id,
      description,
      candidate
    });
  });

  socket.on('disconnect', async () => {
    console.log(`User disconnected: ${socket.user?.name} (${socket.id})`);
    const rooms = Array.from(socket.rooms);

    for (const roomCode of rooms) {
      if (roomCode !== socket.id) {
        try {
          const room = await Room.findOne({ code: roomCode });
          if (room) {
            room.waitingList = room.waitingList.filter(u => u.id !== socket.id);
            await room.save();

            const roomSockets = await io.in(roomCode).fetchSockets();
            roomSockets.forEach(s => {
              io.to(s.id).emit('waiting-list-updated', {
                count: room.waitingList.length,
                waitingList: room.waitingList
              });
            });
          }
          socket.to(roomCode).emit('user-left', { userId: socket.id });
        } catch (err) {
          console.error('Error handling disconnect:', err);
        }
      }
    }
  });
});

// Function to get local IP address
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1'; // fallback
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  const localIP = getLocalIP();
  console.log(`🚀 HangoutHub server running on port ${PORT} (HTTP)`);
  console.log(`📁 Serving files from: ${path.join(__dirname, 'public')}`);
  console.log(`📎 File uploads saved to: ${uploadsDir}`);
  console.log('🔐 Simple login authentication configured');
  console.log(`🌐 Local access: http://localhost:${PORT}`);
  console.log(`🌐 Network access: http://${localIP}:${PORT}`);
  console.log(`📱 Share this link with devices on the same Wi-Fi: http://${localIP}:${PORT}`);
});
