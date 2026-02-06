# Football Match Tracking App

A real-time football match tracking application built with Node.js, Express, Handlebars (hbs) templates, and Server-Sent Events (SSE).

## Features

- **Admin View**: Control match flow, start halves, and score goals
- **Client View**: Real-time display of match timer, score, and status
- **Real-time Updates**: All clients see synchronized updates via Server-Sent Events
- **Match Timing**:
  - Each half is 1 minute (60 seconds)
  - Random extra time: 5-10 seconds per half

## Setup

1. Install dependencies:

```bash
npm install
```

1. Start the server:

```bash
npm start
```

Or for development with auto-reload:

```bash
npm run dev
```

1. Open your browser:
   - **Admin View**: <http://localhost:3000/admin>
   - **Client View**: <http://localhost:3000/>

## Usage

### Admin View

- Click "Start Match" to begin the first half
- Use "⚽ Home Goal" or "⚽ Away Goal" buttons to score
- After first half ends, click "Start Second Half"
- Use "Reset Match" to restart the match

### Client View

- Automatically displays live match updates
- Shows current score, timer, and match status
- All clients see synchronized updates in real-time

## Technology Stack

- **Node.js** - Runtime environment
- **Express** - Web framework
- **Handlebars (hbs)** - Template engine
- **Server-Sent Events (SSE)** - Real-time communication
- **Vanilla JavaScript** - Client-side logic

## Project Structure

```
football-simple-app/
├── server.js          # Main server file with SSE endpoints
├── tunnel.js          # Standalone tunneling script
├── package.json       # Dependencies and scripts
├── .env.example       # Environment variables template
├── views/
│   ├── admin.hbs     # Admin interface template
│   └── client.hbs    # Client view template
└── public/
    ├── styles.css    # Styling for both views
    ├── admin.js      # Admin view JavaScript
    └── client.js     # Client view JavaScript
```

## API Endpoints

- `GET /` - Client view
- `GET /admin` - Admin view
- `GET /events` - SSE endpoint for real-time updates
- `POST /api/match/start` - Start the match
- `POST /api/match/start-second-half` - Start second half
- `POST /api/match/score` - Score a goal (body: `{team: 'home'|'away'}`)
- `POST /api/match/reset` - Reset match state

## Match States

- `not_started` - Match hasn't begun
- `first_half` - First half in progress
- `half_time` - Between halves
- `second_half` - Second half in progress
- `finished` - Match completed

## Port Forwarding & Tunneling

The app supports tunneling to make it accessible from outside your local network. Two options are available:

### Option 1: LocalTunnel (Recommended - No Setup Required)

**Automatic tunneling (starts with server):**

```bash
ENABLE_TUNNEL=true npm start
```

**Manual tunneling (separate process):**

```bash
# Terminal 1: Start server
npm start

# Terminal 2: Start tunnel
npm run tunnel
```

**With custom subdomain:**

```bash
TUNNEL_SUBDOMAIN=football-match npm run tunnel
```

### Option 2: Ngrok (Requires Installation)

1. Install ngrok globally:

```bash
npm install -g ngrok
# or download from https://ngrok.com/
```

1. Start server with ngrok:

```bash
ENABLE_TUNNEL=true TUNNEL_SERVICE=ngrok npm start
```

1. Or run ngrok separately:

```bash
# Terminal 1: Start server
npm start

# Terminal 2: Start ngrok
ngrok http 3000
```

### Environment Variables

Create a `.env` file (optional) for configuration:

```env
PORT=3000
ENABLE_TUNNEL=false
TUNNEL_SERVICE=localtunnel
TUNNEL_SUBDOMAIN=football-match
NGROK_AUTH_TOKEN=your_token_here
```

### Tunneling Features

- ✅ **Automatic reconnection** - Tunnel reconnects if connection drops
- ✅ **Custom subdomains** - Use your own subdomain with localtunnel
- ✅ **Multiple options** - Choose between localtunnel or ngrok
- ✅ **Standalone script** - Run tunnel separately from server
- ✅ **Public URLs** - Share your app with anyone, anywhere

### Usage Tips

- **LocalTunnel**: Free, no signup required, URLs change on restart (unless using subdomain)
- **Ngrok**: More stable, custom domains available (requires account), better for production
- **Port Forwarding**: For local network access, configure your router to forward port 3000
