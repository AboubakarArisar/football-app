// Load environment variables
require('dotenv').config();

const express = require('express');
const path = require('path');
const hbs = require('hbs');
const app = express();
const PORT = process.env.PORT || 3000;
const ENABLE_TUNNEL = process.env.ENABLE_TUNNEL === 'true';
const TUNNEL_SERVICE = process.env.TUNNEL_SERVICE || 'localtunnel'; // 'localtunnel' or 'ngrok'

// Set up Handlebars as view engine
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));

// Register Handlebars helpers
hbs.registerHelper('replace', function(str, find, replace) {
  return str.replace(new RegExp(find, 'g'), replace);
});

hbs.registerHelper('uppercase', function(str) {
  return str.toUpperCase();
});

hbs.registerHelper('eq', function(a, b) {
  return a === b;
});

hbs.registerHelper('neq', function(a, b) {
  return a !== b;
});

hbs.registerHelper('or', function(a, b) {
  return a || b;
});

hbs.registerHelper('canScore', function(status) {
  return status === 'first_half' || status === 'second_half' || status === 'paused';
});

hbs.registerHelper('json', function(context) {
  return JSON.stringify(context, null, 2);
});

hbs.registerHelper('toMinutes', function(seconds) {
  return Math.floor(seconds / 60);
});

// Serve static files
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Match state
let matchState = {
  status: 'not_started', // not_started, first_half, half_time, second_half, finished, paused
  currentHalf: 1,
  timer: 0, // seconds elapsed in current half
  halfDuration: 60, // Default 1 minute = 60 seconds (can be changed)
  extraTime: 0, // random 5-10 seconds
  homeScore: 0,
  awayScore: 0,
  homeTeam: 'Home Team',
  awayTeam: 'Away Team',
  isPaused: false,
  lastEvent: null, // Track last event: 'start', 'pause', 'resume', 'half_time', 'second_half', 'penalty', 'finished'
  intervalId: null
};

// Store SSE clients
const clients = new Set();

// Sanitize match state for JSON serialization (remove circular references)
function sanitizeMatchState(state) {
  return {
    status: state.status,
    currentHalf: state.currentHalf,
    timer: state.timer,
    halfDuration: state.halfDuration,
    extraTime: state.extraTime,
    homeScore: state.homeScore,
    awayScore: state.awayScore,
    homeTeam: state.homeTeam,
    awayTeam: state.awayTeam,
    isPaused: state.isPaused,
    lastEvent: state.lastEvent // Track last event for whistle sounds
  };
}

// Broadcast function to send updates to all clients
function broadcast(data) {
  const sanitized = sanitizeMatchState(data);
  const message = `data: ${JSON.stringify(sanitized)}\n\n`;
  clients.forEach(client => {
    try {
      client.write(message);
    } catch (error) {
      clients.delete(client);
    }
  });
}

// Match timer logic
function startTimer() {
  if (matchState.intervalId) {
    clearInterval(matchState.intervalId);
  }

  matchState.intervalId = setInterval(() => {
    // Don't increment timer if paused
    if (matchState.isPaused) {
      return;
    }
    
    matchState.timer++;
    
    // Calculate extra time when half duration is reached (if not already calculated)
    if (matchState.timer === matchState.halfDuration && matchState.extraTime === 0) {
      matchState.extraTime = Math.floor(Math.random() * 6) + 5; // Random 5-10 seconds
      broadcast(matchState);
      return; // Don't check for end yet, continue to extra time
    }
    
    // Check if half time is reached (including extra time)
    const totalTime = matchState.halfDuration + matchState.extraTime;
    if (matchState.timer >= totalTime) {
      if (matchState.status === 'first_half') {
        matchState.status = 'half_time';
        matchState.timer = 0;
        matchState.extraTime = 0; // Reset for next half
        matchState.isPaused = false;
        matchState.lastEvent = 'half_time';
        clearInterval(matchState.intervalId);
        matchState.intervalId = null;
      } else if (matchState.status === 'second_half') {
        matchState.status = 'finished';
        matchState.extraTime = 0; // Reset
        matchState.isPaused = false;
        matchState.lastEvent = 'finished';
        clearInterval(matchState.intervalId);
        matchState.intervalId = null;
      }
    }
    
    broadcast(matchState);
  }, 1000);
}

// Routes
app.get('/', (req, res) => {
  // Pass sanitized state to template (without intervalId)
  const sanitized = sanitizeMatchState(matchState);
  res.render('client', { matchState: sanitized });
});

app.get('/admin', (req, res) => {
  // Pass sanitized state to template (without intervalId)
  const sanitized = sanitizeMatchState(matchState);
  res.render('admin', { matchState: sanitized });
});

// API endpoint to get current match state (for initial page load)
app.get('/api/match/state', (req, res) => {
  res.json(sanitizeMatchState(matchState));
});

// SSE endpoint for real-time updates
app.get('/events', (req, res) => {
  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Send initial state immediately (sanitized)
  const sanitized = sanitizeMatchState(matchState);
  res.write(`data: ${JSON.stringify(sanitized)}\n\n`);

  // Store client connection
  clients.add(res);

  // Remove client on disconnect
  req.on('close', () => {
    clients.delete(res);
  });
});

// Admin API endpoints
app.post('/api/match/start', (req, res) => {
  if (matchState.status === 'not_started') {
    matchState.status = 'first_half';
    matchState.currentHalf = 1;
    matchState.timer = 0;
    matchState.extraTime = 0; // Will be calculated when half duration is reached
    matchState.lastEvent = 'start';
    startTimer();
    broadcast(matchState);
    res.json({ success: true, matchState: sanitizeMatchState(matchState) });
  } else {
    res.json({ success: false, message: 'Match already started' });
  }
});

app.post('/api/match/start-second-half', (req, res) => {
  if (matchState.status === 'half_time') {
    matchState.status = 'second_half';
    matchState.currentHalf = 2;
    matchState.timer = 0;
    matchState.extraTime = 0; // Will be calculated when half duration is reached
    matchState.lastEvent = 'second_half';
    startTimer();
    broadcast(matchState);
    res.json({ success: true, matchState: sanitizeMatchState(matchState) });
  } else {
    res.json({ success: false, message: 'Cannot start second half in current state' });
  }
});

app.post('/api/match/score', (req, res) => {
  const { team } = req.body; // 'home' or 'away'
  
  if (matchState.status === 'first_half' || matchState.status === 'second_half' || matchState.status === 'paused') {
    if (team === 'home') {
      matchState.homeScore++;
    } else if (team === 'away') {
      matchState.awayScore++;
    }
    broadcast(matchState);
    res.json({ success: true, matchState: sanitizeMatchState(matchState) });
  } else {
    res.json({ success: false, message: 'Match is not in progress' });
  }
});

app.post('/api/match/reset', (req, res) => {
  if (matchState.intervalId) {
    clearInterval(matchState.intervalId);
    matchState.intervalId = null;
  }
  const homeTeam = matchState.homeTeam;
  const awayTeam = matchState.awayTeam;
  const halfDuration = matchState.halfDuration;
  matchState = {
    status: 'not_started',
    currentHalf: 1,
    timer: 0,
    halfDuration: halfDuration,
    extraTime: 0,
    homeScore: 0,
    awayScore: 0,
    homeTeam: homeTeam,
    awayTeam: awayTeam,
    isPaused: false,
    lastEvent: null,
    intervalId: null
  };
  broadcast(matchState);
  res.json({ success: true, matchState: sanitizeMatchState(matchState) });
});

// Set team names
app.post('/api/match/teams', (req, res) => {
  const { homeTeam, awayTeam } = req.body;
  if (homeTeam) matchState.homeTeam = homeTeam;
  if (awayTeam) matchState.awayTeam = awayTeam;
  broadcast(matchState);
  res.json({ success: true, matchState: sanitizeMatchState(matchState) });
});

// Set half duration
app.post('/api/match/half-duration', (req, res) => {
  const { duration } = req.body; // duration in seconds
  if (duration && duration > 0 && matchState.status === 'not_started') {
    matchState.halfDuration = parseInt(duration);
    broadcast(matchState);
    res.json({ success: true, matchState: sanitizeMatchState(matchState) });
  } else {
    res.json({ success: false, message: 'Can only set duration before match starts' });
  }
});

// Pause/Resume match
app.post('/api/match/pause', (req, res) => {
  if (matchState.status === 'first_half' || matchState.status === 'second_half') {
    matchState.isPaused = true;
    matchState.status = 'paused';
    matchState.lastEvent = 'pause';
    broadcast(matchState);
    res.json({ success: true, matchState: sanitizeMatchState(matchState) });
  } else {
    res.json({ success: false, message: 'Match is not in progress' });
  }
});

app.post('/api/match/resume', (req, res) => {
  if (matchState.status === 'paused') {
    // Restore previous status based on current half
    matchState.status = matchState.currentHalf === 1 ? 'first_half' : 'second_half';
    matchState.isPaused = false;
    matchState.lastEvent = 'resume';
    // Restart timer if it was stopped
    if (!matchState.intervalId) {
      startTimer();
    }
    broadcast(matchState);
    res.json({ success: true, matchState: sanitizeMatchState(matchState) });
  } else {
    res.json({ success: false, message: 'Match is not paused' });
  }
});

// Penalty
app.post('/api/match/penalty', (req, res) => {
  const { team, result } = req.body; // team: 'home' or 'away', result: 'scored' or 'missed'
  
  if (matchState.status === 'first_half' || matchState.status === 'second_half' || matchState.status === 'paused') {
    matchState.lastEvent = 'penalty';
    if (result === 'scored') {
      if (team === 'home') {
        matchState.homeScore++;
      } else if (team === 'away') {
        matchState.awayScore++;
      }
    }
    // If missed, no score change
    broadcast(matchState);
    res.json({ success: true, matchState: sanitizeMatchState(matchState) });
  } else {
    res.json({ success: false, message: 'Match is not in progress' });
  }
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`\n╔═══════════════════════════════════════════════════════╗`);
  console.log(`║     ⚽ Football Match App Started Successfully! ⚽     ║`);
  console.log(`╚═══════════════════════════════════════════════════════╝\n`);
  console.log(`📍 Local URLs:`);
  console.log(`   Admin:  http://localhost:${PORT}/admin`);
  console.log(`   Client: http://localhost:${PORT}/\n`);
  
  // Start tunneling if enabled
  if (ENABLE_TUNNEL) {
    startTunnel();
  } else {
    console.log(`💡 To enable tunneling, set ENABLE_TUNNEL=true`);
    console.log(`   Example: ENABLE_TUNNEL=true npm start\n`);
  }
});

// Tunneling function
function startTunnel() {
  if (TUNNEL_SERVICE === 'localtunnel') {
    const localtunnel = require('localtunnel');
    
    localtunnel({ port: PORT, subdomain: process.env.TUNNEL_SUBDOMAIN })
      .then(tunnel => {
        console.log(`🌐 Tunnel Active (localtunnel):`);
        console.log(`   Admin:  ${tunnel.url}/admin`);
        console.log(`   Client: ${tunnel.url}/\n`);
        console.log(`⚠️  Tunnel URL will change on restart (use TUNNEL_SUBDOMAIN for fixed URL)\n`);
        
        tunnel.on('close', () => {
          console.log('⚠️  Tunnel closed. Reconnecting...');
          setTimeout(startTunnel, 2000);
        });
      })
      .catch(err => {
        console.error('❌ Tunnel error:', err.message);
        console.log('💡 Trying without subdomain...\n');
        // Retry without subdomain
        localtunnel({ port: PORT })
          .then(tunnel => {
            console.log(`🌐 Tunnel Active (localtunnel):`);
            console.log(`   Admin:  ${tunnel.url}/admin`);
            console.log(`   Client: ${tunnel.url}/\n`);
          })
          .catch(err => console.error('❌ Tunnel failed:', err.message));
      });
  } else if (TUNNEL_SERVICE === 'ngrok') {
    try {
      const ngrok = require('ngrok');
      ngrok.connect({
        addr: PORT,
        authtoken: process.env.NGROK_AUTH_TOKEN // Optional, for custom domains
      }).then(url => {
        console.log(`🌐 Tunnel Active (ngrok):`);
        console.log(`   Admin:  ${url}/admin`);
        console.log(`   Client: ${url}/\n`);
        console.log(`📊 Ngrok Dashboard: http://127.0.0.1:4040\n`);
      }).catch(err => {
        console.error('❌ Ngrok error:', err.message);
        console.log('💡 Install ngrok: npm install -g ngrok');
        console.log('   Or use localtunnel: TUNNEL_SERVICE=localtunnel npm start\n');
      });
    } catch (err) {
      console.error('❌ Ngrok not installed. Install with: npm install ngrok');
      console.log('💡 Or use localtunnel: TUNNEL_SERVICE=localtunnel npm start\n');
    }
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});
