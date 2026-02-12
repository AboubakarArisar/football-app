// Load environment variables
require('dotenv').config();

const express = require('express');
const session = require('express-session');
const path = require('path');
const hbs = require('hbs');
const { connectDB, users, tournaments, matches } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-this-secret-in-production';
const ENABLE_TUNNEL = process.env.ENABLE_TUNNEL === 'true';

// Session configuration
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

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


// Middleware
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Authentication middleware
function isAuthenticated(req, res, next) {
  if (req.session && req.session.userId) {
    next();
  } else {
    res.redirect('/login');
  }
}

// Optional authentication (allow access but check if logged in)
function checkAuth(req, res, next) {
  if (req.session && req.session.userId) {
    req.user = users.findById(req.session.userId);
  }
  next();
}

// Sanitize match state for JSON serialization
function sanitizeMatchState(state) {
  return {
    id: state.id,
    tournament_id: state.tournament_id,
    status: state.status,
    current_half: state.current_half,
    timer: state.timer,
    half_duration: state.half_duration,
    extra_time: state.extra_time,
    home_score: state.home_score,
    away_score: state.away_score,
    home_team: state.home_team,
    away_team: state.away_team,
    is_paused: state.is_paused
  };
}

// Store match timers and SSE clients per tournament
const matchTimers = {};
const sseClients = {};

// Auth Routes
app.get('/login', checkAuth, (req, res) => {
  if (req.user) {
    return res.redirect('/dashboard');
  }
  res.render('login');
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.render('login', { error: 'Username and password are required' });
  }

  try {
    const user = await users.findByUsername(username);
    
    if (!user || !users.verifyPassword(user.password, password)) {
      return res.render('login', { error: 'Invalid username or password' });
    }

    req.session.userId = user._id;
    req.session.username = user.username;
    res.redirect('/dashboard');
  } catch (error) {
    res.render('login', { error: 'Login failed' });
  }
});

app.get('/register', checkAuth, (req, res) => {
  if (req.user) {
    return res.redirect('/dashboard');
  }
  res.render('register');
});

app.post('/register', (req, res) => {
  const { username, email, password, confirmPassword } = req.body;

  if (!username || !email || !password || !confirmPassword) {
    return res.render('register', { error: 'All fields are required' });
  }

  if (password !== confirmPassword) {
    return res.render('register', { error: 'Passwords do not match' });
  }

  if (password.length < 6) {
    return res.render('register', { error: 'Password must be at least 6 characters' });
  }

  try {
    users.create(username, email, password);
    res.render('register', { success: 'Account created successfully! Please login.' });
  } catch (error) {
    res.render('register', { error: error.message });
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

// Dashboard - User's tournaments
app.get('/dashboard', isAuthenticated, async (req, res) => {
  const userTournaments = await tournaments.findByCreator(req.session.userId);
  res.render('dashboard', {
    username: req.session.username,
    tournaments: userTournaments
  });
});

// Home - View live tournaments/matches
app.get('/', checkAuth, async (req, res) => {
  const activeTournaments = await tournaments.findAll();
  
  // Get match info for each tournament
  const tournamentsWithMatches = await Promise.all(activeTournaments.map(async (tournament) => {
    const tournamentMatches = await matches.findByTournament(tournament._id);
    const liveMatches = tournamentMatches.filter(m => 
      ['first_half', 'second_half', 'paused'].includes(m.status)
    );
    return {
      ...tournament.toObject(),
      live_matches_count: liveMatches.length,
      matches_count: tournamentMatches.length
    };
  }));

  res.render('home', {
    activeTournaments: tournamentsWithMatches,
    isLoggedIn: !!req.user
  });
});

// Serve static files

// Tournament Management
app.post('/api/tournaments', isAuthenticated, async (req, res) => {
  const { name, description } = req.body;

  if (!name) {
    return res.status(400).json({ success: false, error: 'Tournament name is required' });
  }

  try {
    const tournamentId = await tournaments.create(req.session.userId, name, description);
    res.json({ success: true, tournament_id: tournamentId });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.get('/api/tournaments/:id', async (req, res) => {
  const tournament = await tournaments.findById(req.params.id);
  
  if (!tournament) {
    return res.status(404).json({ error: 'Tournament not found' });
  }

  const tournamentMatches = await matches.findByTournament(tournament._id);
  res.json({
    ...tournament.toObject(),
    matches: tournamentMatches
  });
});

app.post('/api/tournaments/:id/start', isAuthenticated, async (req, res) => {
  const tournament = await tournaments.findById(req.params.id);
  
  if (!tournament) {
    return res.status(404).json({ error: 'Tournament not found' });
  }

  if (tournament.creator_id.toString() !== req.session.userId) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  try {
    const updated = await tournaments.update(req.params.id, {
      status: 'active',
      started_at: new Date().toISOString()
    });
    res.json({ success: true, tournament: updated });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.post('/api/tournaments/:id/finish', isAuthenticated, async (req, res) => {
  const tournament = await tournaments.findById(req.params.id);
  
  if (!tournament) {
    return res.status(404).json({ error: 'Tournament not found' });
  }

  if (tournament.creator_id.toString() !== req.session.userId) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  try {
    const updated = await tournaments.update(req.params.id, {
      status: 'finished',
      finished_at: new Date().toISOString()
    });
    res.json({ success: true, tournament: updated });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Match Management
app.post('/api/matches', isAuthenticated, async (req, res) => {
  const { tournament_id, home_team, away_team, half_duration } = req.body;

  if (!tournament_id || !home_team || !away_team) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }

  const tournament = await tournaments.findById(tournament_id);
  if (!tournament || tournament.creator_id.toString() !== req.session.userId) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  try {
    const matchId = await matches.create(
      tournament_id,
      home_team,
      away_team,
      half_duration ? parseInt(half_duration) : 300
    );
    
    // Initialize SSE clients for this tournament if not exists
    if (!sseClients[tournament_id]) {
      sseClients[tournament_id] = {};
    }

    res.json({ success: true, match_id: matchId });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.get('/api/matches/:id', async (req, res) => {
  const match = await matches.findById(req.params.id);
  
  if (!match) {
    return res.status(404).json({ error: 'Match not found' });
  }

  res.json(sanitizeMatchState(match));
});

// Get initial match state
app.get('/api/matches/:id/state', async (req, res) => {
  const match = await matches.findById(req.params.id);
  
  if (!match) {
    return res.status(404).json({ error: 'Match not found' });
  }

  res.json(sanitizeMatchState(match));
});

// SSE Connection for live updates - specific match in tournament
app.get('/api/tournaments/:tournament_id/matches/:match_id/events', async (req, res) => {
  const { tournament_id, match_id } = req.params;
  const match = await matches.findById(match_id);

  if (!match || match.tournament_id.toString() !== tournament_id) {
    return res.status(404).json({ error: 'Match not found' });
  }

  // Initialize tournament SSE clients if needed
  if (!sseClients[tournament_id]) {
    sseClients[tournament_id] = {};
  }

  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Send initial state
  const sanitized = sanitizeMatchState(match);
  res.write(`data: ${JSON.stringify(sanitized)}\n\n`);

  // Store client connection by match ID
  if (!sseClients[tournament_id][match_id]) {
    sseClients[tournament_id][match_id] = new Set();
  }
  sseClients[tournament_id][match_id].add(res);

  // Remove client on disconnect
  req.on('close', () => {
    if (sseClients[tournament_id] && sseClients[tournament_id][match_id]) {
      sseClients[tournament_id][match_id].delete(res);
    }
  });
});

// Broadcast match update to all SSE clients
function broadcastMatch(tournamentId, matchId, matchState) {
  const sanitized = sanitizeMatchState(matchState);
  const message = `data: ${JSON.stringify(sanitized)}\n\n`;
  
  if (sseClients[tournamentId] && sseClients[tournamentId][matchId]) {
    sseClients[tournamentId][matchId].forEach(client => {
      try {
        client.write(message);
      } catch (error) {
        sseClients[tournamentId][matchId].delete(client);
      }
    });
  }
}

// Start match timer
function startMatchTimer(matchId, tournamentId) {
  if (matchTimers[matchId]) {
    clearInterval(matchTimers[matchId]);
  }

  const intervalId = setInterval(async () => {
    try {
      const match = await matches.findById(matchId);
      
      if (!match) {
        clearInterval(matchTimers[matchId]);
        delete matchTimers[matchId];
        return;
      }

      // Don't increment if paused
      if (match.is_paused) {
        return;
      }

      // Increment timer
      let newTimer = match.timer + 1;
      let newExtraTime = match.extra_time;

      // Calculate extra time when half duration is reached
      if (newTimer === match.half_duration && newExtraTime === 0) {
        newExtraTime = Math.floor(Math.random() * 6) + 5;
      }

      // Check if half is finished
      const totalTime = match.half_duration + newExtraTime;
      let newStatus = match.status;

      if (newTimer >= totalTime) {
        if (match.status === 'first_half') {
          newStatus = 'half_time';
          newTimer = 0;
          newExtraTime = 0;
        } else if (match.status === 'second_half') {
          newStatus = 'finished';
          newExtraTime = 0;
          clearInterval(matchTimers[matchId]);
          delete matchTimers[matchId];
        }
      }

      // Update match in database
      await matches.update(matchId, {
        timer: newTimer,
        extra_time: newExtraTime,
        status: newStatus
      });

      // Get updated match and broadcast
      const updatedMatch = await matches.findById(matchId);
      broadcastMatch(tournamentId, matchId, updatedMatch);
    } catch (error) {
      console.error('Timer update error:', error);
    }
  }, 1000);

  matchTimers[matchId] = intervalId;
}

// Match API endpoints
app.post('/api/matches/:id/start', isAuthenticated, async (req, res) => {
  const match = await matches.findById(req.params.id);
  
  if (!match) {
    return res.status(404).json({ error: 'Match not found' });
  }

  const tournament = await tournaments.findById(match.tournament_id);
  if (tournament.creator_id.toString() !== req.session.userId) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  if (match.status !== 'not_started') {
    return res.status(400).json({ error: 'Match already started' });
  }

  try {
    await matches.update(req.params.id, {
      status: 'first_half',
      current_half: 1,
      timer: 0,
      extra_time: 0,
      started_at: new Date().toISOString()
    });

    startMatchTimer(req.params.id, match.tournament_id);

    const updated = await matches.findById(req.params.id);
    broadcastMatch(match.tournament_id, req.params.id, updated);
    res.json({ success: true, match: sanitizeMatchState(updated) });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.post('/api/matches/:id/start-second-half', isAuthenticated, async (req, res) => {
  const match = await matches.findById(req.params.id);
  
  if (!match) {
    return res.status(404).json({ error: 'Match not found' });
  }

  const tournament = await tournaments.findById(match.tournament_id);
  if (tournament.creator_id.toString() !== req.session.userId) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  if (match.status !== 'half_time') {
    return res.status(400).json({ error: 'Cannot start second half' });
  }

  try {
    await matches.update(req.params.id, {
      status: 'second_half',
      current_half: 2,
      timer: 0,
      extra_time: 0
    });

    startMatchTimer(req.params.id, match.tournament_id);

    const updated = await matches.findById(req.params.id);
    broadcastMatch(match.tournament_id, req.params.id, updated);
    res.json({ success: true, match: sanitizeMatchState(updated) });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.post('/api/matches/:id/score', isAuthenticated, async (req, res) => {
  const { team } = req.body;
  const match = await matches.findById(req.params.id);

  if (!match) {
    return res.status(404).json({ error: 'Match not found' });
  }

  const tournament = await tournaments.findById(match.tournament_id);
  if (tournament.creator_id.toString() !== req.session.userId) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  if (!['first_half', 'second_half', 'paused'].includes(match.status)) {
    return res.status(400).json({ error: 'Match is not in progress' });
  }

  try {
    const updates = {};
    if (team === 'home') {
      updates.home_score = match.home_score + 1;
    } else if (team === 'away') {
      updates.away_score = match.away_score + 1;
    }

    await matches.update(req.params.id, updates);
    const updated = await matches.findById(req.params.id);
    broadcastMatch(match.tournament_id, req.params.id, updated);
    res.json({ success: true, match: sanitizeMatchState(updated) });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.post('/api/matches/:id/pause', isAuthenticated, async (req, res) => {
  const match = await matches.findById(req.params.id);

  if (!match) {
    return res.status(404).json({ error: 'Match not found' });
  }

  const tournament = await tournaments.findById(match.tournament_id);
  if (tournament.creator_id.toString() !== req.session.userId) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  if (!['first_half', 'second_half'].includes(match.status)) {
    return res.status(400).json({ error: 'Match is not in progress' });
  }

  try {
    await matches.update(req.params.id, {
      status: 'paused',
      is_paused: true
    });

    const updated = await matches.findById(req.params.id);
    broadcastMatch(match.tournament_id, req.params.id, updated);
    res.json({ success: true, match: sanitizeMatchState(updated) });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.post('/api/matches/:id/resume', isAuthenticated, async (req, res) => {
  const match = await matches.findById(req.params.id);

  if (!match) {
    return res.status(404).json({ error: 'Match not found' });
  }

  const tournament = await tournaments.findById(match.tournament_id);
  if (tournament.creator_id.toString() !== req.session.userId) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  if (match.status !== 'paused') {
    return res.status(400).json({ error: 'Match is not paused' });
  }

  try {
    const status = match.current_half === 1 ? 'first_half' : 'second_half';
    await matches.update(req.params.id, {
      status: status,
      is_paused: false
    });

    // Restart timer if needed
    if (!matchTimers[req.params.id]) {
      startMatchTimer(req.params.id, match.tournament_id);
    }

    const updated = await matches.findById(req.params.id);
    broadcastMatch(match.tournament_id, req.params.id, updated);
    res.json({ success: true, match: sanitizeMatchState(updated) });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.post('/api/matches/:id/reset', isAuthenticated, async (req, res) => {
  const match = await matches.findById(req.params.id);

  if (!match) {
    return res.status(404).json({ error: 'Match not found' });
  }

  const tournament = await tournaments.findById(match.tournament_id);
  if (tournament.creator_id.toString() !== req.session.userId) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  try {
    if (matchTimers[req.params.id]) {
      clearInterval(matchTimers[req.params.id]);
      delete matchTimers[req.params.id];
    }

    await matches.update(req.params.id, {
      status: 'not_started',
      current_half: 1,
      timer: 0,
      extra_time: 0,
      home_score: 0,
      away_score: 0,
      is_paused: false
    });

    const updated = await matches.findById(req.params.id);
    broadcastMatch(match.tournament_id, req.params.id, updated);
    res.json({ success: true, match: sanitizeMatchState(updated) });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Tournament Admin View
app.get('/tournament/:id', isAuthenticated, async (req, res) => {
  const tournament = await tournaments.findById(req.params.id);

  if (!tournament) {
    return res.status(404).render('error', { error: 'Tournament not found' });
  }

  if (tournament.creator_id.toString() !== req.session.userId) {
    return res.status(403).render('error', { error: 'Unauthorized' });
  }

  const tournamentMatches = await matches.findByTournament(req.params.id);
  res.render('tournament-admin', {
    tournament: tournament.toObject ? tournament.toObject() : tournament,
    matches: tournamentMatches,
    username: req.session.username
  });
});

// Tournament view for spectators
app.get('/tournament/:id/view', checkAuth, async (req, res) => {
  const tournament = await tournaments.findById(req.params.id);

  if (!tournament || tournament.status !== 'active') {
    return res.status(404).render('error', { error: 'Tournament not found or not active' });
  }

  const tournamentMatches = await matches.findByTournament(req.params.id);
  const liveMatches = tournamentMatches.filter(m => 
    ['first_half', 'second_half', 'paused'].includes(m.status)
  );

  res.render('tournament-view', {
    tournament: tournament.toObject ? tournament.toObject() : tournament,
    matches: tournamentMatches,
    liveMatches,
    isLoggedIn: !!req.user
  });
});

// Specific match view
app.get('/tournament/:tournament_id/match/:match_id', checkAuth, async (req, res) => {
  const tournament = await tournaments.findById(req.params.tournament_id);
  const match = await matches.findById(req.params.match_id);

  if (!tournament || !match || match.tournament_id.toString() !== req.params.tournament_id) {
    return res.status(404).render('error', { error: 'Match not found' });
  }

  if (tournament.status !== 'active') {
    return res.status(404).render('error', { error: 'Tournament not active' });
  }

  res.render('match-view', {
    tournament: tournament.toObject ? tournament.toObject() : tournament,
    match: sanitizeMatchState(match),
    isLoggedIn: !!req.user
  });
});



// Start server with MongoDB connection
async function startServer() {
  try {
    // Connect to MongoDB
    await connectDB();
    console.log('✅ Connected to MongoDB');

    const server = app.listen(PORT, () => {
      console.log(`\n╔═══════════════════════════════════════════════════════╗`);
      console.log(`║   ⚽ Football Tournament App Started Successfully! ⚽  ║`);
      console.log(`╚═══════════════════════════════════════════════════════╝\n`);
      console.log(`📍 Local URLs:`);
      console.log(`   Home:      http://localhost:${PORT}/`);
      console.log(`   Login:     http://localhost:${PORT}/login`);
      console.log(`   Register:  http://localhost:${PORT}/register`);
      console.log(`   Dashboard: http://localhost:${PORT}/dashboard\n`);
      
      if (ENABLE_TUNNEL) {
        startTunnel();
      }
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      console.log('\n🛑 Shutting down gracefully...');
      server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
      });
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();

// Tunneling function
function startTunnel() {
  if (process.env.TUNNEL_SERVICE === 'localtunnel') {
    const localtunnel = require('localtunnel');
    
    localtunnel({ port: PORT, subdomain: process.env.TUNNEL_SUBDOMAIN })
      .then(tunnel => {
        console.log(`🌐 Tunnel Active (localtunnel):`);
        console.log(`   Home: ${tunnel.url}/\n`);
        
        tunnel.on('close', () => {
          console.log('⚠️  Tunnel closed. Reconnecting...');
          setTimeout(startTunnel, 2000);
        });
      })
      .catch(err => {
        console.error('❌ Tunnel error:', err.message);
      });
  }
}
