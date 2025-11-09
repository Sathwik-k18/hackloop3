// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// ✅ Single BASE_URL variable
const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const PORT = process.env.PORT || 5000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: CORS_ORIGIN,
    methods: ["GET", "POST"]
  }
});

// Store rooms and participants
const rooms = new Map();

io.on('connection', (socket) => {
  console.log(`[CONNECT] User connected: ${socket.id}`);

  socket.on('join-room', ({ roomId, userName }) => {
    console.log(`[JOIN] ${userName} (${socket.id}) joining room: ${roomId}`);
    socket.join(roomId);

    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Map());
      console.log(`[ROOM CREATED] Room ${roomId} initialized.`);
    }

    const room = rooms.get(roomId);
    room.set(socket.id, {
      id: socket.id,
      name: userName,
      isCameraOn: true,
      isMicOn: true
    });

    const participants = Array.from(room.values());
    socket.emit('existing-participants', participants.filter(p => p.id !== socket.id));
    socket.to(roomId).emit('user-joined', {
      id: socket.id,
      name: userName,
      isCameraOn: true,
      isMicOn: true
    });

    console.log(`[ROOM STATUS] Room ${roomId} now has ${room.size} participant(s).`);
  });

  // WebRTC signaling
  socket.on('offer', ({ to, offer, from }) => {
    console.log(`[SIGNAL] Offer from ${from} → ${to}`);
    io.to(to).emit('offer', { from, offer });
  });

  socket.on('answer', ({ to, answer, from }) => {
    console.log(`[SIGNAL] Answer from ${from} → ${to}`);
    io.to(to).emit('answer', { from, answer });
  });

  socket.on('ice-candidate', ({ to, candidate, from }) => {
    console.log(`[SIGNAL] ICE Candidate from ${from} → ${to}`);
    io.to(to).emit('ice-candidate', { from, candidate });
  });

  // Chat
  socket.on('send-message', ({ roomId, message }) => {
    console.log(`[CHAT] Message in ${roomId}:`, message);
    io.to(roomId).emit('receive-message', message);
  });

  // Camera / Mic toggles
  socket.on('toggle-camera', ({ roomId, isCameraOn }) => {
    const room = rooms.get(roomId);
    if (room && room.has(socket.id)) {
      const user = room.get(socket.id);
      user.isCameraOn = isCameraOn;
      socket.to(roomId).emit('user-toggle-camera', { id: socket.id, isCameraOn });
    }
  });

  socket.on('toggle-mic', ({ roomId, isMicOn }) => {
    const room = rooms.get(roomId);
    if (room && room.has(socket.id)) {
      const user = room.get(socket.id);
      user.isMicOn = isMicOn;
      socket.to(roomId).emit('user-toggle-mic', { id: socket.id, isMicOn });
    }
  });

  // Leave room or disconnect
  socket.on('leave-room', (roomId) => handleUserLeave(socket, roomId));
  socket.on('disconnect', () => {
    console.log(`[DISCONNECT] ${socket.id}`);
    rooms.forEach((room, roomId) => {
      if (room.has(socket.id)) handleUserLeave(socket, roomId);
    });
  });

  function handleUserLeave(socket, roomId) {
    const room = rooms.get(roomId);
    if (room) {
      const user = room.get(socket.id);
      room.delete(socket.id);
      socket.to(roomId).emit('user-left', { id: socket.id, name: user?.name });

      if (room.size === 0) {
        rooms.delete(roomId);
        console.log(`[ROOM CLEANUP] Room ${roomId} deleted.`);
      } else {
        console.log(`[ROOM STATUS] Room ${roomId} now has ${room.size} participant(s).`);
      }
    }
    socket.leave(roomId);
  }
});

server.listen(PORT, () => {
  console.log(`[SERVER] Running at: ${BASE_URL}`);
});
