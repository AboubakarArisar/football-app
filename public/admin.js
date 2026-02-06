// Fetch initial state immediately on page load
async function loadInitialState() {
  try {
    const response = await fetch('/api/match/state');
    const matchState = await response.json();
    updateUI(matchState);
  } catch (error) {
    console.error('Error loading initial state:', error);
  }
}

// Load initial state immediately
loadInitialState();

// Connect to SSE
const eventSource = new EventSource('/events');

// Update UI when match state changes
eventSource.onmessage = function(event) {
  const matchState = JSON.parse(event.data);
  updateUI(matchState);
};

eventSource.onerror = function(error) {
  console.error('SSE error:', error);
};

// Also update when SSE connection opens (in case initial fetch was slow)
eventSource.onopen = function() {
  console.log('SSE connection opened');
};

function updateUI(matchState) {
  // Update status badge
  const statusBadge = document.querySelector('.status-badge');
  statusBadge.className = `status-badge ${matchState.status}`;
  statusBadge.textContent = matchState.status.replace('_', ' ').toUpperCase();
  
  // Update team names
  const homeTeamName = document.getElementById('homeTeamName');
  const awayTeamName = document.getElementById('awayTeamName');
  if (homeTeamName) homeTeamName.textContent = matchState.homeTeam || 'Home Team';
  if (awayTeamName) awayTeamName.textContent = matchState.awayTeam || 'Away Team';
  
  // Update score
  const homeScore = document.querySelector('.team.home .score');
  const awayScore = document.querySelector('.team.away .score');
  homeScore.textContent = matchState.homeScore;
  awayScore.textContent = matchState.awayScore;
  
  // Update timer
  updateTimer(matchState);
  
  // Update match state display
  const matchStateDisplay = document.getElementById('matchStateDisplay');
  matchStateDisplay.textContent = JSON.stringify(matchState, null, 2);
  
  // Update button states
  updateButtonStates(matchState);
  
  // Update extra time
  const extraTime = document.querySelector('.extra-time');
  extraTime.textContent = `Extra Time: +${matchState.extraTime}s`;
}

function updateTimer(matchState) {
  const timerDisplay = document.getElementById('timerDisplay');
  const minutes = Math.floor(matchState.timer / 60);
  const seconds = matchState.timer % 60;
  timerDisplay.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function updateButtonStates(matchState) {
  const startMatchBtn = document.getElementById('startMatch');
  const startSecondHalfBtn = document.getElementById('startSecondHalf');
  const scoreHomeBtn = document.getElementById('scoreHome');
  const scoreAwayBtn = document.getElementById('scoreAway');
  const pauseMatchBtn = document.getElementById('pauseMatch');
  const resumeMatchBtn = document.getElementById('resumeMatch');
  const penaltyHomeBtn = document.getElementById('penaltyHome');
  const penaltyAwayBtn = document.getElementById('penaltyAway');
  
  startMatchBtn.disabled = matchState.status !== 'not_started';
  startSecondHalfBtn.disabled = matchState.status !== 'half_time';
  
  const canScore = matchState.status === 'first_half' || matchState.status === 'second_half';
  const canPause = matchState.status === 'first_half' || matchState.status === 'second_half';
  const canPenalty = canScore || matchState.status === 'paused';
  
  scoreHomeBtn.disabled = !canScore;
  scoreAwayBtn.disabled = !canScore;
  pauseMatchBtn.disabled = !canPause;
  resumeMatchBtn.disabled = matchState.status !== 'paused';
  penaltyHomeBtn.disabled = !canPenalty;
  penaltyAwayBtn.disabled = !canPenalty;
}

// Button event listeners
document.getElementById('startMatch').addEventListener('click', async () => {
  try {
    const response = await fetch('/api/match/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await response.json();
    if (data.success) {
      console.log('Match started');
    }
  } catch (error) {
    console.error('Error starting match:', error);
  }
});

document.getElementById('startSecondHalf').addEventListener('click', async () => {
  try {
    const response = await fetch('/api/match/start-second-half', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await response.json();
    if (data.success) {
      console.log('Second half started');
    }
  } catch (error) {
    console.error('Error starting second half:', error);
  }
});

document.getElementById('scoreHome').addEventListener('click', async () => {
  try {
    const response = await fetch('/api/match/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ team: 'home' })
    });
    const data = await response.json();
    if (data.success) {
      console.log('Home goal scored!');
    }
  } catch (error) {
    console.error('Error scoring goal:', error);
  }
});

document.getElementById('scoreAway').addEventListener('click', async () => {
  try {
    const response = await fetch('/api/match/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ team: 'away' })
    });
    const data = await response.json();
    if (data.success) {
      console.log('Away goal scored!');
    }
  } catch (error) {
    console.error('Error scoring goal:', error);
  }
});

document.getElementById('resetMatch').addEventListener('click', async () => {
  if (confirm('Are you sure you want to reset the match?')) {
    try {
      const response = await fetch('/api/match/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await response.json();
      if (data.success) {
        console.log('Match reset');
      }
    } catch (error) {
      console.error('Error resetting match:', error);
    }
  }
});

// Team name setters
document.getElementById('setHomeTeam').addEventListener('click', async () => {
  const homeTeam = document.getElementById('homeTeamInput').value.trim();
  if (homeTeam) {
    try {
      const response = await fetch('/api/match/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ homeTeam })
      });
      const data = await response.json();
      if (data.success) {
        console.log('Home team name updated');
      }
    } catch (error) {
      console.error('Error updating home team:', error);
    }
  }
});

document.getElementById('setAwayTeam').addEventListener('click', async () => {
  const awayTeam = document.getElementById('awayTeamInput').value.trim();
  if (awayTeam) {
    try {
      const response = await fetch('/api/match/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ awayTeam })
      });
      const data = await response.json();
      if (data.success) {
        console.log('Away team name updated');
      }
    } catch (error) {
      console.error('Error updating away team:', error);
    }
  }
});

// Half duration setter
document.getElementById('setHalfDuration').addEventListener('click', async () => {
  const duration = parseInt(document.getElementById('halfDurationInput').value);
  if (duration && duration > 0) {
    try {
      const response = await fetch('/api/match/half-duration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duration })
      });
      const data = await response.json();
      if (data.success) {
        alert(`Half duration set to ${duration} seconds (${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, '0')})`);
      } else {
        alert(data.message || 'Failed to set half duration');
      }
    } catch (error) {
      console.error('Error setting half duration:', error);
      alert('Error setting half duration');
    }
  } else {
    alert('Please enter a valid duration (greater than 0)');
  }
});

// Pause/Resume
document.getElementById('pauseMatch').addEventListener('click', async () => {
  try {
    const response = await fetch('/api/match/pause', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await response.json();
    if (data.success) {
      console.log('Match paused');
    }
  } catch (error) {
    console.error('Error pausing match:', error);
  }
});

document.getElementById('resumeMatch').addEventListener('click', async () => {
  try {
    const response = await fetch('/api/match/resume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await response.json();
    if (data.success) {
      console.log('Match resumed');
    }
  } catch (error) {
    console.error('Error resuming match:', error);
  }
});

// Penalty handlers
document.getElementById('penaltyHome').addEventListener('click', async () => {
  const result = confirm('Home Team Penalty\n\nClick OK if SCORED\nClick Cancel if MISSED');
  const penaltyResult = result ? 'scored' : 'missed';
  
  try {
    const response = await fetch('/api/match/penalty', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ team: 'home', result: penaltyResult })
    });
    const data = await response.json();
    if (data.success) {
      console.log(`Home penalty ${penaltyResult}`);
    }
  } catch (error) {
    console.error('Error recording penalty:', error);
  }
});

document.getElementById('penaltyAway').addEventListener('click', async () => {
  const result = confirm('Away Team Penalty\n\nClick OK if SCORED\nClick Cancel if MISSED');
  const penaltyResult = result ? 'scored' : 'missed';
  
  try {
    const response = await fetch('/api/match/penalty', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ team: 'away', result: penaltyResult })
    });
    const data = await response.json();
    if (data.success) {
      console.log(`Away penalty ${penaltyResult}`);
    }
  } catch (error) {
    console.error('Error recording penalty:', error);
  }
});
