const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// ========== BAD WORD FILTER (evasion-resistant) ==========
const badWords = [
  'damn', 'hell', 'ass', 'bastard', 'crap',
  'shit', 'fuck', 'dick', 'bitch', 'slut',
  'whore', 'cunt', 'nigger', 'faggot', 'retard',
  'idiot', 'loser', 'stupid', 'moron', 'dumbass'
];

// Leetspeak mapping for normalization
const LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '@': 'a', '$': 's' };

function normalizeForFilter(text) {
  const lower = text.toLowerCase();
  let out = '';
  for (let i = 0; i < lower.length; i++) {
    const c = lower[i];
    if (/[a-z]/.test(c)) out += c;
    else if (LEET[c] !== undefined) out += LEET[c];
    else if (/[0-9@$]/.test(c)) out += LEET[c] || c;
  }
  return out;
}

function containsBadWord(message) {
  const normalized = normalizeForFilter(message);
  for (const word of badWords) {
    if (normalized.length < word.length) continue;
    for (let i = 0; i <= normalized.length - word.length; i++) {
      if (normalized.substr(i, word.length) === word) return true;
    }
  }
  return false;
}

// Filter: reject messages containing bad words (no store/broadcast); otherwise return as-is
function filterMessage(message) {
  if (containsBadWord(message)) return null;
  return message;
}

// ========== FILE-BASED MESSAGE STORAGE ==========
const MESSAGES_FILE = path.join(__dirname, 'messages.json');
const MAX_MESSAGES_PER_ROOM = 100;
let ENCRYPTION_KEY = null;
if (process.env.MESSAGE_ENCRYPTION_KEY) {
  const buf = Buffer.from(process.env.MESSAGE_ENCRYPTION_KEY.replace(/^0x/, ''), 'hex');
  if (buf.length === 32) ENCRYPTION_KEY = buf;
  else console.warn('MESSAGE_ENCRYPTION_KEY must be 32 bytes (64 hex chars). At-rest encryption disabled.');
}

function loadMessages() {
  try {
    if (fs.existsSync(MESSAGES_FILE)) {
      const raw = fs.readFileSync(MESSAGES_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed._enc && ENCRYPTION_KEY) {
        const iv = Buffer.from(parsed.iv, 'base64');
        const tag = Buffer.from(parsed.tag, 'base64');
        const cipher = Buffer.from(parsed.data, 'base64');
        const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
        decipher.setAuthTag(tag);
        return JSON.parse(decipher.update(cipher) + decipher.final('utf8'));
      }
      if (parsed._enc) return {};
      return parsed;
    }
  } catch (err) {
    console.error('Error loading messages:', err);
  }
  return {};
}

function saveMessages(allMessages) {
  try {
    let out;
    if (ENCRYPTION_KEY) {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
      const enc = Buffer.concat([cipher.update(JSON.stringify(allMessages), 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();
      out = JSON.stringify({ _enc: true, iv: iv.toString('base64'), tag: tag.toString('base64'), data: enc.toString('base64') });
    } else {
      out = JSON.stringify(allMessages);
    }
    fs.writeFileSync(MESSAGES_FILE, out);
  } catch (err) {
    console.error('Error saving messages:', err);
  }
}

let saveTimeout = null;
function debouncedSave() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => saveMessages(savedMessages), 2000);
}

let savedMessages = loadMessages();

// In-memory storage
const rooms = {};

// ========== SNAKE GAME ==========
const GRID_SIZE = 20;
const SNAKE_TICK_MS = 150;
const snakeGames = {}; // gameId -> { roomId, snakes: { socketId: { username, segments, direction } }, food, intervalId }

function generateGameId() {
  return 'snake-' + Math.random().toString(36).substr(2, 9);
}

function spawnFood(snakes) {
  const used = new Set();
  Object.values(snakes).forEach(s => s.segments.forEach(([x, y]) => used.add(x + ',' + y)));
  let x, y;
  do {
    x = Math.floor(Math.random() * GRID_SIZE);
    y = Math.floor(Math.random() * GRID_SIZE);
  } while (used.has(x + ',' + y));
  return [x, y];
}

function runSnakeTick(gameId) {
  const game = snakeGames[gameId];
  if (!game) return;
  const { roomId, snakes } = game;
  const allSegmentsNow = [];
  Object.values(snakes).forEach(s => s.segments.forEach(seg => allSegmentsNow.push(seg[0] + ',' + seg[1])));
  const newSegments = {};
  let foodEaten = false;
  for (const [sid, data] of Object.entries(snakes)) {
    const [headX, headY] = data.segments[0];
    let nx = headX, ny = headY;
    switch (data.direction) {
      case 'up': ny = headY - 1; break;
      case 'down': ny = headY + 1; break;
      case 'left': nx = headX - 1; break;
      case 'right': nx = headX + 1; break;
    }
    if (nx < 0 || nx >= GRID_SIZE || ny < 0 || ny >= GRID_SIZE) continue;
    if (allSegmentsNow.indexOf(nx + ',' + ny) >= 0) continue;
    const newHead = [nx, ny];
    const ateFood = game.food[0] === nx && game.food[1] === ny;
    newSegments[sid] = {
      username: data.username,
      segments: ateFood ? [newHead, ...data.segments] : [newHead, ...data.segments.slice(0, -1)],
      direction: data.direction
    };
    if (ateFood) foodEaten = true;
  }
  game.snakes = newSegments;
  if (foodEaten) game.food = spawnFood(game.snakes);
  const alive = Object.keys(game.snakes).length;
  if (alive <= 1) {
    clearInterval(game.intervalId);
    delete snakeGames[gameId];
    io.to(roomId).emit('snake-game-over', { gameId, winner: alive === 1 ? Object.values(game.snakes)[0].username : null });
    return;
  }
  io.to(roomId).emit('snake-state', {
    gameId,
    snakes: game.snakes,
    food: game.food,
    gridSize: GRID_SIZE
  });
}

// ========== GAME INVITES (sidebar, 1-min expiry, creator can delete) ==========
const gameInvites = {};       // inviteId -> { roomId, type, gameId/challengeId, creatorId, creatorUsername }
const gameInviteTimeouts = {};// inviteId -> timeoutId
const INVITE_TTL_MS = 60 * 1000;

function removeGameInvite(inviteId) {
  if (gameInviteTimeouts[inviteId]) {
    clearTimeout(gameInviteTimeouts[inviteId]);
    delete gameInviteTimeouts[inviteId];
  }
  const inv = gameInvites[inviteId];
  if (inv) {
    const roomId = inv.roomId;
    delete gameInvites[inviteId];
    io.to(roomId).emit('game-invite-removed', { inviteId });
  }
}

function getInvitesForRoom(roomId) {
  return Object.entries(gameInvites)
    .filter(([, inv]) => inv.roomId === roomId)
    .map(([id, inv]) => ({ inviteId: id, type: inv.type, creatorUsername: inv.creatorUsername }));
}

// ========== RPS ==========
const rpsChallenges = {}; // challengeId -> { roomId, challengerId, challengerUsername }
const rpsMatches = {};    // challengeId -> { roomId, challengerId, challengerUsername, acceptorId, acceptorUsername, choices: {} }

// Serve static files from public directory
app.use(express.static('public'));

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Create a new room
  socket.on('create-room', (data) => {
    const roomId = generateRoomId();
    const existing = savedMessages[roomId] || [];
    rooms[roomId] = {
      name: data.name,
      isPrivate: data.isPrivate,
      password: data.password || null,
      messages: existing.slice(-MAX_MESSAGES_PER_ROOM),
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

    // Send room data, message history, and current game invites for sidebar
    socket.emit('room-joined', {
      roomId,
      roomName: room.name,
      messages: room.messages,
      users: room.users,
      gameInvites: getInvitesForRoom(roomId)
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

    const filteredMessage = filterMessage(message);
    if (filteredMessage === null) {
      socket.emit('message-rejected', { reason: 'Message blocked by moderation' });
      return;
    }

    const messageData = {
      id: Date.now(),
      username: socket.username,
      message: filteredMessage,
      timestamp: new Date().toLocaleTimeString()
    };

    room.messages.push(messageData);
    room.messages = room.messages.slice(-MAX_MESSAGES_PER_ROOM);
    savedMessages[roomId] = room.messages;
    debouncedSave();
    io.to(roomId).emit('new-message', messageData);
  });

  // ----- Snake -----
  socket.on('snake-create', (data) => {
    const { roomId } = data;
    const room = rooms[roomId];
    if (!roomId || !room) return;
    const gameId = generateGameId();
    const startX = Math.floor(GRID_SIZE / 2);
    const startY = Math.floor(GRID_SIZE / 2);
    snakeGames[gameId] = {
      roomId,
      snakes: {
        [socket.id]: {
          username: socket.username,
          segments: [[startX, startY]],
          direction: 'right'
        }
      },
      food: spawnFood({ [socket.id]: { segments: [[startX, startY]] } }),
      intervalId: null
    };
    snakeGames[gameId].intervalId = setInterval(() => runSnakeTick(gameId), SNAKE_TICK_MS);
    gameInvites[gameId] = { roomId, type: 'snake', gameId, creatorId: socket.id, creatorUsername: socket.username };
    io.to(roomId).emit('game-invite-new', { inviteId: gameId, type: 'snake', gameId, creatorUsername: socket.username });
    gameInviteTimeouts[gameId] = setTimeout(() => removeGameInvite(gameId), INVITE_TTL_MS);
    socket.emit('snake-created', { gameId });
  });

  socket.on('snake-join', (data) => {
    const { gameId } = data;
    const game = snakeGames[gameId];
    if (!game || !socket.currentRoom || game.roomId !== socket.currentRoom) return;
    if (game.snakes[socket.id]) return;
    removeGameInvite(gameId);
    const x = Math.floor(Math.random() * (GRID_SIZE - 4)) + 2;
    const y = Math.floor(Math.random() * (GRID_SIZE - 4)) + 2;
    const dirs = ['up', 'down', 'left', 'right'];
    game.snakes[socket.id] = {
      username: socket.username,
      segments: [[x, y]],
      direction: dirs[Math.floor(Math.random() * 4)]
    };
    socket.emit('snake-joined', { gameId });
    io.to(game.roomId).emit('snake-state', {
      gameId,
      snakes: game.snakes,
      food: game.food,
      gridSize: GRID_SIZE
    });
  });

  socket.on('snake-move', (data) => {
    const { gameId, direction } = data;
    const game = snakeGames[gameId];
    if (!game || !game.snakes[socket.id]) return;
    const d = game.snakes[socket.id].direction;
    const opp = { up: 'down', down: 'up', left: 'right', right: 'left' };
    if (opp[d] === direction) return;
    game.snakes[socket.id].direction = direction;
  });

  // ----- RPS -----
  socket.on('rps-challenge', (data) => {
    const { roomId } = data;
    if (!roomId || !rooms[roomId]) return;
    const challengeId = 'rps-' + Date.now();
    rpsChallenges[challengeId] = {
      roomId,
      challengerId: socket.id,
      challengerUsername: socket.username
    };
    gameInvites[challengeId] = { roomId, type: 'rps', challengeId, creatorId: socket.id, creatorUsername: socket.username };
    io.to(roomId).emit('game-invite-new', { inviteId: challengeId, type: 'rps', challengeId, creatorUsername: socket.username });
    gameInviteTimeouts[challengeId] = setTimeout(() => removeGameInvite(challengeId), INVITE_TTL_MS);
  });

  socket.on('rps-accept', (data) => {
    const { challengeId } = data;
    const chal = rpsChallenges[challengeId];
    if (!chal || chal.challengerId === socket.id) return;
    if (!socket.currentRoom || chal.roomId !== socket.currentRoom) return;
    removeGameInvite(challengeId);
    delete rpsChallenges[challengeId];
    rpsMatches[challengeId] = {
      roomId: chal.roomId,
      challengerId: chal.challengerId,
      challengerUsername: chal.challengerUsername,
      acceptorId: socket.id,
      acceptorUsername: socket.username,
      choices: {}
    };
    io.to(chal.roomId).emit('rps-match-started', {
      challengeId,
      challenger: chal.challengerUsername,
      acceptor: socket.username
    });
    io.to(chal.challengerId).emit('rps-choose', { challengeId });
    socket.emit('rps-choose', { challengeId });
  });

  socket.on('rps-choice', (data) => {
    const { challengeId, choice } = data;
    const match = rpsMatches[challengeId];
    if (!match || (choice !== 'rock' && choice !== 'paper' && choice !== 'scissors')) return;
    const choiceKey = socket.id === match.challengerId ? 'challenger' : 'acceptor';
    if (match.choices[choiceKey]) return;
    match.choices[choiceKey] = choice;
    if (!match.choices.challenger || !match.choices.acceptor) return;
    const c = match.choices.challenger;
    const a = match.choices.acceptor;
    let winner = null;
    if (c !== a) {
      if ((c === 'rock' && a === 'scissors') || (c === 'paper' && a === 'rock') || (c === 'scissors' && a === 'paper')) winner = match.challengerUsername;
      else winner = match.acceptorUsername;
    }
    io.to(match.roomId).emit('rps-result', {
      challengeId,
      challenger: match.challengerUsername,
      acceptor: match.acceptorUsername,
      challengerChoice: c,
      acceptorChoice: a,
      winner
    });
    delete rpsMatches[challengeId];
  });

  socket.on('game-invite-cancel', (data) => {
    const { inviteId } = data;
    const inv = gameInvites[inviteId];
    if (!inv || inv.creatorId !== socket.id) return;
    if (inv.type === 'snake' && snakeGames[inviteId]) {
      clearInterval(snakeGames[inviteId].intervalId);
      delete snakeGames[inviteId];
      io.to(inv.roomId).emit('snake-game-over', { gameId: inviteId, winner: null });
    }
    if (inv.type === 'rps') delete rpsChallenges[inviteId];
    removeGameInvite(inviteId);
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    Object.keys(gameInvites).filter(id => gameInvites[id].creatorId === socket.id).forEach(removeGameInvite);
    Object.keys(snakeGames).forEach(gid => {
      const g = snakeGames[gid];
      if (g.snakes[socket.id]) {
        delete g.snakes[socket.id];
        if (Object.keys(g.snakes).length <= 1) {
          clearInterval(g.intervalId);
          delete snakeGames[gid];
          io.to(g.roomId).emit('snake-game-over', { gameId: gid, winner: Object.keys(g.snakes).length === 1 ? Object.values(g.snakes)[0].username : null });
        }
      }
    });
    Object.keys(rpsChallenges).forEach(cid => {
      if (rpsChallenges[cid].challengerId === socket.id) delete rpsChallenges[cid];
    });
    Object.keys(rpsMatches).forEach(cid => {
      const m = rpsMatches[cid];
      if (m.challengerId === socket.id || m.acceptorId === socket.id) delete rpsMatches[cid];
    });
    if (socket.currentRoom) {
      const room = rooms[socket.currentRoom];
      if (room) {
        room.users = room.users.filter(u => u.id !== socket.id);
        socket.to(socket.currentRoom).emit('user-left', { username: socket.username });
        io.to(socket.currentRoom).emit('users-updated', room.users);
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