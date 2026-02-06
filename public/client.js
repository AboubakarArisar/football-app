// Audio elements
const goalSound = new Audio('/goal.mp3');
const awayGoalSound = new Audio('/away-goal.mp3');
const whistleSound = new Audio('/whistle-refree.mp3');

// Preload audio and set properties
[goalSound, awayGoalSound, whistleSound].forEach(audio => {
  audio.preload = 'auto';
  audio.volume = 0.7; // Set volume to 70%
});

// Audio enabled flag (requires user interaction)
let audioEnabled = false;

// Enable audio after first user interaction
function enableAudio() {
  if (audioEnabled) return;
  
  // Try to play and immediately pause to unlock audio
  const unlockAudio = () => {
    const promises = [goalSound, awayGoalSound, whistleSound].map(audio => {
      return audio.play().then(() => {
        audio.pause();
        audio.currentTime = 0;
      }).catch(() => {
        // Ignore errors during unlock
      });
    });
    
    Promise.all(promises).then(() => {
      audioEnabled = true;
      console.log('Audio enabled');
      // Remove the audio prompt if it exists
      const audioPrompt = document.getElementById('audio-prompt');
      if (audioPrompt) {
        audioPrompt.style.display = 'none';
      }
    });
  };
  
  unlockAudio();
}

// Enable audio on any user interaction
const enableAudioEvents = ['click', 'touchstart', 'keydown'];
enableAudioEvents.forEach(event => {
  document.addEventListener(event, enableAudio, { once: true, passive: true });
});

// Store previous state for comparison
let previousState = null;
let celebrationShown = false;

// Fetch initial state immediately on page load
async function loadInitialState() {
  try {
    const response = await fetch('/api/match/state');
    const matchState = await response.json();
    previousState = { ...matchState };
    updateUI(matchState);
  } catch (error) {
    console.error('Error loading initial state:', error);
  }
}

// Load initial state immediately
loadInitialState();

// Show audio prompt if audio is not enabled
function showAudioPrompt() {
  if (audioEnabled) return;
  
  const existingPrompt = document.getElementById('audio-prompt');
  if (existingPrompt) return;
  
  const prompt = document.createElement('div');
  prompt.id = 'audio-prompt';
  prompt.innerHTML = `
    <div class="audio-prompt-content">
      <p>🔊 Click here to enable match sounds</p>
    </div>
  `;
  
  // Make prompt clickable to enable audio
  prompt.addEventListener('click', () => {
    enableAudio();
  });
  
  document.body.appendChild(prompt);
  
  // Auto-hide after 8 seconds
  setTimeout(() => {
    if (prompt.parentNode && !audioEnabled) {
      prompt.style.opacity = '0';
      setTimeout(() => {
        if (prompt.parentNode) prompt.remove();
      }, 300);
    }
  }, 8000);
}

// Show prompt after page loads
setTimeout(showAudioPrompt, 500);

// Connect to SSE for real-time updates
const eventSource = new EventSource('/events');

// Update UI when match state changes
eventSource.onmessage = function(event) {
  const matchState = JSON.parse(event.data);
  updateUI(matchState);
};

eventSource.onerror = function(error) {
  console.error('SSE error:', error);
  // Try to reconnect after 3 seconds
  setTimeout(() => {
    location.reload();
  }, 3000);
};

// Also update when SSE connection opens (in case initial fetch was slow)
eventSource.onopen = function() {
  console.log('SSE connection opened');
};

function updateUI(matchState) {
  // Check for status changes (half-time start/end, match finish)
  if (previousState && previousState.status !== matchState.status) {
    handleStatusChange(previousState.status, matchState.status);
  }
  
  // Check for penalty event (lastEvent === 'penalty')
  if (matchState.lastEvent === 'penalty' && (!previousState || previousState.lastEvent !== 'penalty')) {
    playWhistle();
  }
  
  // Update team names
  const homeTeamName = document.getElementById('homeTeamName');
  const awayTeamName = document.getElementById('awayTeamName');
  if (homeTeamName) homeTeamName.textContent = matchState.homeTeam || 'Home Team';
  if (awayTeamName) awayTeamName.textContent = matchState.awayTeam || 'Away Team';
  
  // Update status badge
  const statusBadge = document.getElementById('statusBadge');
  statusBadge.className = `status-badge ${matchState.status}`;
  statusBadge.textContent = matchState.status.replace('_', ' ').toUpperCase();
  
  // Update score with animations and sounds
  const homeScore = document.getElementById('homeScore');
  const awayScore = document.getElementById('awayScore');
  
  // Check for goal scored
  if (previousState) {
    if (previousState.homeScore !== matchState.homeScore) {
      playHomeGoalAnimation(homeScore);
      // Play goal sound with slight delay for better effect
      setTimeout(() => {
        if (audioEnabled) {
          goalSound.currentTime = 0;
          goalSound.play().catch(e => {
            // If play fails, try to enable audio
            if (!audioEnabled) enableAudio();
          });
        }
      }, 100);
    }
    
    if (previousState.awayScore !== matchState.awayScore) {
      playAwayGoalAnimation(awayScore);
      // Play away goal sound with slight delay for better effect
      setTimeout(() => {
        if (audioEnabled) {
          awayGoalSound.currentTime = 0;
          awayGoalSound.play().catch(e => {
            // If play fails, try to enable audio
            if (!audioEnabled) enableAudio();
          });
        }
      }, 100);
    }
  }
  
  homeScore.textContent = matchState.homeScore;
  awayScore.textContent = matchState.awayScore;
  
  // Update timer
  updateTimer(matchState);
  
  // Update half display
  const halfDisplay = document.getElementById('halfDisplay');
  halfDisplay.textContent = matchState.currentHalf;
  
  // Update match status
  const matchStatus = document.getElementById('matchStatus');
  matchStatus.textContent = matchState.status.replace('_', ' ').toUpperCase();
  
  const currentHalf = document.getElementById('currentHalf');
  currentHalf.textContent = matchState.currentHalf;
  
  // Update extra time
  const extraTimeDisplay = document.querySelector('.extra-time-display');
  if (extraTimeDisplay) {
    extraTimeDisplay.textContent = `Extra Time: +${matchState.extraTime}s`;
  }
  
  // Check for match finish and home team win (only once)
  if (matchState.status === 'finished' && !celebrationShown) {
    checkWinner(matchState);
    celebrationShown = true;
  }
  
  // Reset celebration flag if match is reset
  if (matchState.status === 'not_started' && previousState && previousState.status === 'finished') {
    celebrationShown = false;
  }
  
  // Update previous state
  previousState = { ...matchState };
}

function playWhistle() {
  if (audioEnabled) {
    whistleSound.currentTime = 0;
    whistleSound.play().catch(e => {
      // If play fails, try to enable audio
      if (!audioEnabled) enableAudio();
    });
  }
}

function handleStatusChange(oldStatus, newStatus) {
  // Play whistle for all status changes
  if (audioEnabled) {
    // Match start (not_started -> first_half)
    if (oldStatus === 'not_started' && newStatus === 'first_half') {
      playWhistle();
    }
    // Half time (first_half -> half_time)
    else if (oldStatus === 'first_half' && newStatus === 'half_time') {
      playWhistle();
    }
    // Second half start (half_time -> second_half)
    else if (oldStatus === 'half_time' && newStatus === 'second_half') {
      playWhistle();
    }
    // Pause (first_half/second_half -> paused)
    else if ((oldStatus === 'first_half' || oldStatus === 'second_half') && newStatus === 'paused') {
      playWhistle();
    }
    // Resume (paused -> first_half/second_half)
    else if (oldStatus === 'paused' && (newStatus === 'first_half' || newStatus === 'second_half')) {
      playWhistle();
    }
    // Match finished (second_half -> finished) - play twice for final whistle
    else if (oldStatus === 'second_half' && newStatus === 'finished') {
      playWhistle();
      setTimeout(() => {
        playWhistle();
      }, 800);
    }
  }
}

function playHomeGoalAnimation(scoreElement) {
  // Remove any existing animation classes
  scoreElement.classList.remove('goal-animation', 'home-goal-celebration');
  
  // Trigger reflow
  void scoreElement.offsetWidth;
  
  // Add animation classes
  scoreElement.classList.add('goal-animation', 'home-goal-celebration');
  
  // Remove classes after animation
  setTimeout(() => {
    scoreElement.classList.remove('goal-animation', 'home-goal-celebration');
  }, 2000);
}

function playAwayGoalAnimation(scoreElement) {
  // Remove any existing animation classes
  scoreElement.classList.remove('goal-animation', 'away-goal-celebration');
  
  // Trigger reflow
  void scoreElement.offsetWidth;
  
  // Add animation classes
  scoreElement.classList.add('goal-animation', 'away-goal-celebration');
  
  // Remove classes after animation
  setTimeout(() => {
    scoreElement.classList.remove('goal-animation', 'away-goal-celebration');
  }, 2000);
}

function checkWinner(matchState) {
  const homeScore = matchState.homeScore;
  const awayScore = matchState.awayScore;
  
  if (homeScore > awayScore) {
    // Home team wins - show celebration
    showHomeTeamCelebration();
  }
}

function showHomeTeamCelebration() {
  // Remove existing celebration if any
  const existingCelebration = document.getElementById('celebration-overlay');
  if (existingCelebration) {
    existingCelebration.remove();
  }
  
  // Create celebration overlay
  const celebration = document.createElement('div');
  celebration.id = 'celebration-overlay';
  celebration.innerHTML = `
    <div class="celebration-content">
      <h1 class="celebration-title">🏆 HOME TEAM WINS! 🏆</h1>
      <div class="celebration-confetti"></div>
      <div class="celebration-confetti"></div>
      <div class="celebration-confetti"></div>
      <div class="celebration-confetti"></div>
      <div class="celebration-confetti"></div>
    </div>
  `;
  
  document.body.appendChild(celebration);
  
  // Remove celebration after 5 seconds
  setTimeout(() => {
    celebration.classList.add('fade-out');
    setTimeout(() => {
      celebration.remove();
    }, 1000);
  }, 5000);
}

function updateTimer(matchState) {
  const timerDisplay = document.getElementById('timerDisplay');
  const minutes = Math.floor(matchState.timer / 60);
  const seconds = matchState.timer % 60;
  timerDisplay.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  
  // Change color when approaching half time
  const totalTime = matchState.halfDuration + matchState.extraTime;
  if (matchState.timer >= matchState.halfDuration) {
    timerDisplay.style.color = '#e74c3c';
  } else {
    timerDisplay.style.color = '#2c3e50';
  }
}

// Add CSS transitions and animations
const style = document.createElement('style');
style.textContent = `
  .score {
    transition: transform 0.3s ease;
  }
  .timer-display {
    transition: color 0.3s ease;
  }
  
  /* Goal Animations */
  .goal-animation {
    animation: goalPulse 0.6s ease-in-out;
  }
  
  .home-goal-celebration {
    animation: homeGoalCelebration 2s ease-in-out;
    color: #27ae60 !important;
    text-shadow: 0 0 20px rgba(39, 174, 96, 0.8);
  }
  
  .away-goal-celebration {
    animation: awayGoalCelebration 2s ease-in-out;
    color: #e67e22 !important;
    text-shadow: 0 0 20px rgba(230, 126, 34, 0.8);
  }
  
  @keyframes goalPulse {
    0% { transform: scale(1); }
    50% { transform: scale(1.5) rotate(5deg); }
    100% { transform: scale(1); }
  }
  
  @keyframes homeGoalCelebration {
    0%, 100% { transform: scale(1) rotate(0deg); }
    25% { transform: scale(1.3) rotate(-10deg); }
    50% { transform: scale(1.4) rotate(10deg); }
    75% { transform: scale(1.2) rotate(-5deg); }
  }
  
  @keyframes awayGoalCelebration {
    0%, 100% { transform: scale(1) rotate(0deg); }
    25% { transform: scale(1.3) rotate(10deg); }
    50% { transform: scale(1.4) rotate(-10deg); }
    75% { transform: scale(1.2) rotate(5deg); }
  }
  
  /* Celebration Overlay */
  #celebration-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 10000;
    animation: fadeIn 0.5s ease-in;
  }
  
  #celebration-overlay.fade-out {
    animation: fadeOut 1s ease-out forwards;
  }
  
  .celebration-content {
    text-align: center;
    position: relative;
  }
  
  .celebration-title {
    font-size: 4em;
    color: #f39c12;
    text-shadow: 0 0 30px rgba(243, 156, 18, 0.8),
                 0 0 60px rgba(243, 156, 18, 0.6),
                 0 0 90px rgba(243, 156, 18, 0.4);
    animation: celebrationTitle 2s ease-in-out infinite;
    margin-bottom: 30px;
  }
  
  .celebration-confetti {
    position: absolute;
    width: 10px;
    height: 10px;
    background: #f39c12;
    animation: confettiFall 3s linear infinite;
  }
  
  .celebration-confetti:nth-child(2) {
    left: 20%;
    background: #e74c3c;
    animation-delay: 0.5s;
  }
  
  .celebration-confetti:nth-child(3) {
    left: 40%;
    background: #3498db;
    animation-delay: 1s;
  }
  
  .celebration-confetti:nth-child(4) {
    left: 60%;
    background: #9b59b6;
    animation-delay: 1.5s;
  }
  
  .celebration-confetti:nth-child(5) {
    left: 80%;
    background: #27ae60;
    animation-delay: 2s;
  }
  
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  
  @keyframes fadeOut {
    from { opacity: 1; }
    to { opacity: 0; }
  }
  
  @keyframes celebrationTitle {
    0%, 100% { transform: scale(1) rotate(0deg); }
    25% { transform: scale(1.1) rotate(-2deg); }
    50% { transform: scale(1.15) rotate(2deg); }
    75% { transform: scale(1.05) rotate(-1deg); }
  }
  
  @keyframes confettiFall {
    0% {
      top: -10px;
      transform: rotate(0deg);
      opacity: 1;
    }
    100% {
      top: 100vh;
      transform: rotate(720deg);
      opacity: 0;
    }
  }
  
  @media (max-width: 768px) {
    .celebration-title {
      font-size: 2.5em;
    }
  }
  
  /* Audio Prompt */
  #audio-prompt {
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(52, 152, 219, 0.95);
    color: white;
    padding: 15px 25px;
    border-radius: 25px;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
    z-index: 9999;
    animation: slideDown 0.5s ease-out;
    transition: opacity 0.3s ease, transform 0.3s ease;
    cursor: pointer;
  }
  
  #audio-prompt:hover {
    background: rgba(41, 128, 185, 0.95);
    transform: translateX(-50%) scale(1.05);
  }
  
  .audio-prompt-content {
    display: flex;
    align-items: center;
    gap: 10px;
    font-weight: bold;
    font-size: 0.95em;
  }
  
  @keyframes slideDown {
    from {
      top: -100px;
      opacity: 0;
    }
    to {
      top: 20px;
      opacity: 1;
    }
  }
  
  @media (max-width: 768px) {
    #audio-prompt {
      top: 10px;
      left: 10px;
      right: 10px;
      transform: none;
      padding: 12px 20px;
      font-size: 0.85em;
    }
    
    #audio-prompt:hover {
      transform: none;
    }
  }
`;
document.head.appendChild(style);
