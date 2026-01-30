const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

// In-memory storage
const rooms = {};

// Serve static files from public directory
app.use(express.static('public'));

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Create a new room
  socket.on('create-room', (data) => {
    const roomId = generateRoomId();
    rooms[roomId] = {
      name: data.name,
      isPrivate: data.isPrivate,
      password: data.password || null,
      messages: [],
      users: []
    };
    socket.emit('room-created', { roomId, room: rooms[roomId] });
    io.emit('rooms-updated', getRoomsList());
    console.log('Room created:', roomId, data.name);
  });

  // Get list of all rooms
  socket.on('get-rooms', () => {
    socket.emit('rooms-list', getRoomsList());
  });

  // Join a room
  socket.on('join-room', (data) => {
    const { roomId, password, username } = data;
    const room = rooms[roomId];

    if (!room) {
      socket.emit('join-error', 'Room not found');
      return;
    }

    // Check password for private rooms
    if (room.isPrivate && room.password !== password) {
      socket.emit('join-error', 'Incorrect password');
      return;
    }

    // Join the room
    socket.join(roomId);
    socket.currentRoom = roomId;
    socket.username = username;

    // Add user to room
    room.users.push({ id: socket.id, username });

    // Send room data and message history
    socket.emit('room-joined', {
      roomId,
      roomName: room.name,
      messages: room.messages,
      users: room.users
    });

    // Notify others in the room
    socket.to(roomId).emit('user-joined', { username });
    io.to(roomId).emit('users-updated', room.users);

    console.log(`${username} joined room ${roomId}`);
  });

  // Send a message
  socket.on('send-message', (data) => {
    const { roomId, message } = data;
    const room = rooms[roomId];

    if (!room) return;

    const messageData = {
      id: Date.now(),
      username: socket.username,
      message,
      timestamp: new Date().toLocaleTimeString()
    };

    // Store message and keep only last 100
    room.messages.push(messageData);
    if (room.messages.length > 100) {
      room.messages.shift();
    }

    // Broadcast to all users in the room
    io.to(roomId).emit('new-message', messageData);
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    if (socket.currentRoom) {
      const room = rooms[socket.currentRoom];
      if (room) {
        // Remove user from room
        room.users = room.users.filter(u => u.id !== socket.id);
        
        // Notify others
        socket.to(socket.currentRoom).emit('user-left', { username: socket.username });
        io.to(socket.currentRoom).emit('users-updated', room.users);

        // Delete room if empty
        if (room.users.length === 0) {
          delete rooms[socket.currentRoom];
          io.emit('rooms-updated', getRoomsList());
          console.log('Room deleted (empty):', socket.currentRoom);
        }
      }
    }
    console.log('User disconnected:', socket.id);
  });
});

// Helper functions
function generateRoomId() {
  return 'room-' + Math.random().toString(36).substr(2, 9);
}

function getRoomsList() {
  return Object.keys(rooms).map(roomId => ({
    id: roomId,
    name: rooms[roomId].name,
    isPrivate: rooms[roomId].isPrivate,
    userCount: rooms[roomId].users.length
  }));
}

// Start server
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
