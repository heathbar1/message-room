# Troubleshooting Guide

## "New Room" button doesn't work

### Step 1: Check if the server is running
1. Open a terminal/command prompt
2. Navigate to your project folder
3. Run: `npm start`
4. You should see: `Server running on http://localhost:3000`

### Step 2: Check the browser console
1. Open your browser (Chrome, Firefox, Edge, etc.)
2. Go to `http://localhost:3000`
3. Press `F12` or right-click → "Inspect"
4. Click the "Console" tab
5. Look for error messages

**What you should see:**
```
Script loaded
Button element: <button class="btn-create" id="showCreateForm">...</button>
Connected to server
```

**Common errors and fixes:**

#### Error: "Cannot connect to server"
- **Problem**: Server is not running
- **Solution**: Run `npm start` in the terminal

#### Error: "socket.io.js 404 Not Found"
- **Problem**: Server not running or wrong URL
- **Solution**: Make sure you're accessing `http://localhost:3000` (not just opening the HTML file directly)

#### Error: "showCreateBtn is null"
- **Problem**: JavaScript is running before HTML loads
- **Solution**: The code should work, but if not, try wrapping the code in:
  ```javascript
  document.addEventListener('DOMContentLoaded', () => {
    // all the code here
  });
  ```

### Step 3: Verify file structure
Make sure your files are organized like this:
```
messaging-website/
├── server.js
├── package.json
└── public/
    ├── index.html
    ├── room.html
    └── style.css
```

### Step 4: Test the button manually
1. Open browser console (`F12`)
2. Type: `document.getElementById('showCreateForm').click()`
3. Press Enter
4. The modal should appear

If it appears, the button works but there might be a styling issue making it hard to click.

### Step 5: Check if you installed dependencies
If you get "Cannot find module 'express'" or similar:
```bash
npm install
```

## Modal appears but form doesn't submit

### Check console for errors
Look for messages like:
- "Creating room: ..."
- "Room created successfully: ..."

### If you see "Connection error":
- Server is not running
- Run `npm start`

## Can't open the website

### Problem: Opening HTML file directly
❌ **Wrong**: `file:///C:/Users/.../index.html`
✅ **Correct**: `http://localhost:3000`

**Why?** 
The app needs a server to work because:
1. Socket.io requires a server connection
2. Browser security blocks file:// from making network requests

**Solution:**
1. Run `npm start` in terminal
2. Open `http://localhost:3000` in your browser

## Port 3000 already in use

**Error**: `EADDRINUSE: address already in use :::3000`

**Solution 1** - Kill the process:
- **Windows**: 
  ```
  netstat -ano | findstr :3000
  taskkill /PID <PID> /F
  ```
- **Mac/Linux**: 
  ```
  lsof -ti:3000 | xargs kill
  ```

**Solution 2** - Use a different port:
Edit `server.js` and change:
```javascript
const PORT = process.env.PORT || 3001; // Changed to 3001
```

## Still not working?

### Complete fresh start:
1. Close VS Code
2. Delete `node_modules` folder
3. Open terminal in project folder
4. Run: `npm install`
5. Run: `npm start`
6. Open: `http://localhost:3000`
7. Check browser console (`F12`)

### Check Node.js version:
```bash
node --version
```
Should be v14 or higher. If not, download from https://nodejs.org

### Quick test - Run this in terminal:
```bash
# Test if server starts
npm start

# In another terminal, test connection
curl http://localhost:3000
```

You should see HTML output, not an error.

## Debug mode enabled

The updated code now includes console.log statements. Watch the console to see:
- When the button is clicked
- When the modal opens
- When the form is submitted
- When the room is created
- Any connection errors

This will help you identify exactly where the problem is occurring.
