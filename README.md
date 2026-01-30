# Messaging Website

A simple, minimalist messaging website with public and private chat rooms. Built with Node.js, Express, and Socket.io with in-memory storage.

## Features

- ✨ Create public or private chat rooms
- 🔒 Password protection for private rooms
- 💬 Real-time messaging
- 👥 See active users in rooms
- 📱 Responsive design
- 🌓 Automatic dark/light theme based on system preference
- 🎨 Clean, minimalist interface

## Prerequisites

- Node.js (v14 or higher)
- npm (comes with Node.js)

## Installation

1. Navigate to the project directory:
```bash
cd messaging-website
```

2. Install dependencies:
```bash
npm install
```

## Running the Application

Start the server:
```bash
npm start
```

The application will be available at: `http://localhost:3000`

## Usage

### Creating a Room
1. Click "New Room" on the home page
2. Enter a room name
3. Choose Public or Private
4. If Private, set a password
5. Click "Create"

### Joining a Room
1. Browse available rooms on the home page
2. Click on a room to join
3. Enter your username
4. If the room is private, enter the password
5. Start chatting!

## File Structure

```
messaging-website/
├── server.js              # Backend server with Socket.io
├── package.json           # Project dependencies
├── public/
│   ├── index.html        # Home page (room list)
│   ├── room.html         # Chat room interface
│   └── style.css         # Styling
└── README.md             # This file
```

## Technical Details

- **Backend**: Node.js with Express
- **Real-time**: Socket.io for WebSocket connections
- **Storage**: In-memory (data resets on server restart)
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Design**: Minimalist with automatic dark/light theme

## Important Notes

⚠️ **Data Persistence**: All rooms and messages are stored in memory. When you restart the server, all data will be lost. This is intentional for simplicity. To add persistence, you would need to implement a database.

🔒 **Security**: This is a basic implementation for learning purposes. For production use, you should add:
- User authentication
- Password hashing
- Rate limiting
- Input sanitization
- HTTPS
- Database persistence

## Customization

### Change Port
Edit `server.js` and modify:
```javascript
const PORT = process.env.PORT || 3000;
```

### Change Theme Colors
Edit `public/style.css` and modify the CSS variables in `:root` section.

## Troubleshooting

**Port already in use:**
- Change the PORT in server.js or kill the process using port 3000

**Cannot connect to server:**
- Make sure the server is running (`npm start`)
- Check if you're accessing the correct URL (`http://localhost:3000`)

**Messages not sending:**
- Check browser console for errors
- Ensure WebSocket connection is established

## License

ISC

## Contributing

Feel free to fork and modify this project for your own use!
