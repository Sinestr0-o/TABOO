/* client.js — client-side logic for Taboo Multiplayer
   Assumes the server serves /style.css and the UI will be rendered dynamically here.
*/

const socket = io(https://taboo-iojt.onrender.com);
let myId = null;
let state = { players: [], game: {} };

// Basic UI render (re-uses the original markup but creates it programmatically to keep files separate)
const app = document.getElementById('app');
app.innerHTML = `
<div class="app" id="app-root">
  <div class="sidebar">
    <div class="topline">
      <h1>TABOO — Party Game (Multiplayer)</h1>
      <div class="status">Rounds: <span id="totalRounds">6</span></div>
    </div>

    <div class="box">
      <label>Enter your nickname</label>
      <input id="nickname" type="text" placeholder="Your name..." />
      <div style="margin-top:8px;display:flex;gap:8px">
        <button id="saveName">Save</button>
        <button class="btn-ghost" id="resetAll">Leave</button>
      </div>
    </div>

    <div class="box">
      <label>Choose team</label>
      <div class="teams">
        <div class="team red" id="joinRed">Join RED <div class="count">(<span id="redCount">0</span>)</div></div>
        <div class="team blue" id="joinBlue">Join BLUE <div class="count">(<span id="blueCount">0</span>)</div></div>
      </div>
    </div>

    <div class="box lobby">
      <label>Players</label>
      <div class="players-list" id="playersList"></div>
    </div>

    <div class="box">
      <label>Game Settings</label>
      <div style="display:flex;gap:8px;align-items:center">
        <div><label style="margin:0">Rounds</label><input id="roundsInput" type="number" min="1" max="12" value="6" style="width:70px;margin-left:6px;padding:6px;border-radius:6px;background:transparent;color:inherit;border:1px solid rgba(255,255,255,0.04)"/></div>
        <div><label style="margin:0">Round time (sec)</label><input id="roundTimeInput" type="number" min="30" max="300" value="120" style="width:90px;margin-left:6px;padding:6px;border-radius:6px;background:transparent;color:inherit;border:1px solid rgba(255,255,255,0.04)"/></div>
      </div>
    </div>

    <div class="box">
      <label>Scoreboard</label>
      <div style="display:flex;gap:8px;align-items:center;justify-content:space-between">
        <div class="points"><strong>Red:</strong> <span id="scoreRed">0</span></div>
        <div class="points"><strong>Blue:</strong> <span id="scoreBlue">0</span></div>
      </div>
    </div>

    <footer>Multiplayer server powered by Socket.io</footer>
  </div>

  <div class="main">
    <div class="game-area">
      <div class="stage" id="stage">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div class="round-info">
            <div>Round <span id="currentRound">0</span> / <span id="totalRoundsLabel">6</span></div>
            <div class="timer" id="timer">02:00</div>
          </div>
          <div class="controls">
            <button id="beOperator">Become operator</button>
            <button id="startRound">Start round</button>
            <button class="btn-ghost" id="nextRound">Next round</button>
          </div>
        </div>

        <div style="display:flex;gap:12px">
          <div style="flex:1">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
              <div>Words (operator sees full list)</div>
              <div class="word-meta">Remaining: <span id="remainingWords">0</span></div>
            </div>
            <div class="words-grid" id="wordsGrid"></div>
          </div>

          <div style="width:260px;display:flex;flex-direction:column;gap:8px">
            <div class="box">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <div><strong>Operator:</strong> <span id="operatorName">—</span></div>
                <div><strong>Team:</strong> <span id="operatorTeam">—</span></div>
              </div>
              <div style="margin-top:8px;color:var(--muted);font-size:13px">Operator can see full 20 words and their points. Other players should not look!</div>
            </div>

            <div class="box">
              <div style="margin-bottom:6px"><strong>Round actions</strong></div>
              <div style="display:flex;flex-direction:column;gap:6px">
                <button id="revealWords" class="btn-ghost">Reveal all words (operator only)</button>
                <button id="shuffleWords" class="btn-ghost">Shuffle words</button>
                <button id="clearGuesses" class="btn-ghost">Clear guessed</button>
              </div>
            </div>

            <div class="box">
              <div style="display:flex;justify-content:space-between"><div>Round summary</div><div id="roundSummary"></div></div>
              <div style="margin-top:8px;color:var(--muted);font-size:13px">Click "Next round" to move on when timer ends or you're ready.</div>
            </div>
          </div>
        </div>
      </div>

      <div class="chat">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <div><strong>Team chat</strong> <span style="font-size:12px;color:var(--muted)">(type guesses below)</span></div>
          <div style="font-size:12px;color:var(--muted)">Operator-only controls will appear when you're operator</div>
        </div>
        <div class="messages" id="messages"></div>
        <div class="chat-input">
          <input id="chatInput" placeholder="Type guess or message..." />
          <button id="sendChat">Send</button>
        </div>
      </div>
    </div>

    <div style="display:flex;justify-content:space-between;align-items:center">
      <div class="status">Game status: <span id="gameStatus">Waiting</span></div>
      <div>
        <button id="endGame" class="btn-ghost">End Game</button>
      </div>
    </div>
  </div>
</div>
`;

// Simple CSS import: fetch style.css (we'll inline a minimal fallback here if not loaded)

// DOM refs
const nicknameEl = document.getElementById('nickname');
const saveNameBtn = document.getElementById('saveName');
const joinRedBtn = document.getElementById('joinRed');
const joinBlueBtn = document.getElementById('joinBlue');
const playersListEl = document.getElementById('playersList');
const redCountEl = document.getElementById('redCount');
const blueCountEl = document.getElementById('blueCount');
const roundsInput = document.getElementById('roundsInput');
const roundTimeInput = document.getElementById('roundTimeInput');
const startRoundBtn = document.getElementById('startRound');
const nextRoundBtn = document.getElementById('nextRound');
const beOperatorBtn = document.getElementById('beOperator');
const operatorNameEl = document.getElementById('operatorName');
const operatorTeamEl = document.getElementById('operatorTeam');
const wordsGrid = document.getElementById('wordsGrid');
const remainingWordsEl = document.getElementById('remainingWords');
const messagesEl = document.getElementById('messages');
const chatInput = document.getElementById('chatInput');
const sendChatBtn = document.getElementById('sendChat');
const timerEl = document.getElementById('timer');
const currentRoundEl = document.getElementById('currentRound');
const totalRoundsLabel = document.getElementById('totalRoundsLabel');
const scoreRedEl = document.getElementById('scoreRed');
const scoreBlueEl = document.getElementById('scoreBlue');
const revealWordsBtn = document.getElementById('revealWords');
const shuffleWordsBtn = document.getElementById('shuffleWords');
const clearGuessesBtn = document.getElementById('clearGuesses');
const roundSummaryEl = document.getElementById('roundSummary');
const gameStatusEl = document.getElementById('gameStatus');
const resetAllBtn = document.getElementById('resetAll');
const endGameBtn = document.getElementById('endGame');

// Events
saveNameBtn.addEventListener('click', ()=>{
  const name = nicknameEl.value.trim(); if(!name) return alert('Enter a name');
  socket.emit('setName', {name});
});
joinRedBtn.addEventListener('click', ()=>socket.emit('joinTeam',{team:'red'}));
joinBlueBtn.addEventListener('click', ()=>socket.emit('joinTeam',{team:'blue'}));
beOperatorBtn.addEventListener('click', ()=>socket.emit('becomeOperator'));
startRoundBtn.addEventListener('click', ()=>socket.emit('startRound'));
nextRoundBtn.addEventListener('click', ()=>socket.emit('nextRound'));
revealWordsBtn.addEventListener('click', ()=>socket.emit('revealWords'));
shuffleWordsBtn.addEventListener('click', ()=>socket.emit('shuffleWords'));
clearGuessesBtn.addEventListener('click', ()=>socket.emit('clearGuesses'));
sendChatBtn.addEventListener('click', ()=>{
  const txt = chatInput.value.trim(); if(!txt) return; // send as chat and attempt guess
  socket.emit('chat', {text: txt});
  socket.emit('guess', {text: txt});
  chatInput.value = '';
});
chatInput.addEventListener('keydown',(e)=>{ if(e.key==='Enter') sendChatBtn.click(); });
resetAllBtn.addEventListener('click', ()=>{
  if(confirm('Leave the game?')) location.reload();
});
endGameBtn.addEventListener('click', ()=>{
  if(confirm('End game (server reset)?')) socket.emit('endGame');
});

// Socket handlers
socket.on('welcome', ({id})=>{ myId = id; console.log('my id', id); });
socket.on('players', (players)=>{ state.players = players; renderPlayers(players); });
socket.on('system', (txt)=> appendMessage({from:'system', text}));
socket.on('chat', ({from, text})=> appendMessage({from, text}));
socket.on('gameState', (g)=>{ state.game = g; renderGameState(); });
socket.on('words', (d)=>{ // full words list (sent at round start)
  // operator will request reveal to see full list
  console.log('words list', d.words);
});
socket.on('wordsReveal', (d)=>{ // operator-only payload
  renderFullWords(d.words);
});
socket.on('timer', (sec)=>{ timerEl.textContent = formatTime(sec); });

function renderPlayers(players){
  playersListEl.innerHTML = '';
  let red = 0, blue = 0;
  players.forEach(p=>{
    const el = document.createElement('div'); el.className='player-item';
    el.innerHTML = `<div>${escapeHtml(p.name)}${p.id===myId? ' (you)':''}</div><div class="badge ${p.team||''}">${p.team? p.team.toUpperCase() : '—'}</div>`;
    playersListEl.appendChild(el);
    if(p.team==='red') red++; if(p.team==='blue') blue++;
  });
  redCountEl.textContent = red; blueCountEl.textContent = blue;
}

function renderGameState(){
  const g = state.game;
  if(!g) return;
  currentRoundEl.textContent = g.round || 0;
  totalRoundsLabel.textContent = g.totalRounds || 6;
  document.getElementById('totalRounds').textContent = g.totalRounds || 6;
  scoreRedEl.textContent = g.scores?.red ?? 0;
  scoreBlueEl.textContent = g.scores?.blue ?? 0;
  gameStatusEl.textContent = g.status || 'waiting';
  remainingWordsEl.textContent = (g.currentWords || []).filter(w=>!w.guessed).length;
  // show guessed words only (others masked)
  wordsGrid.innerHTML = '';
  (g.currentWords || []).forEach(w=>{
    const el = document.createElement('div'); el.className = 'word-card' + (w.guessed ? ' guessed' : '');
    el.innerHTML = `<div style="font-weight:700">${w.guessed ? escapeHtml(w.text) : '••••••'}</div><div class="word-meta">${w.guessed ? ('+'+w.points+' pts') : 'hidden'}</div>`;
    wordsGrid.appendChild(el);
  });
  // operator info
  operatorNameEl.textContent = g.operatorId ? (state.players.find(p=>p.id===g.operatorId)?.name || '—') : '—';
  operatorTeamEl.textContent = g.operatorId ? (state.players.find(p=>p.id===g.operatorId)?.team?.toUpperCase() || '—') : '—';
}

function renderFullWords(words){
  // Render full list (operator-only view)
  wordsGrid.innerHTML = '';
  words.forEach(w=>{
    const el = document.createElement('div'); el.className = 'word-card' + (w.guessed ? ' guessed' : '');
    el.innerHTML = `<div style="font-weight:700">${escapeHtml(w.text)}</div><div class="word-meta">+${w.points} pts</div>`;
    wordsGrid.appendChild(el);
  });
}

function appendMessage(msg){
  const el = document.createElement('div'); el.className = 'message';
  if(msg.from === 'system') el.innerHTML = `<em style="color:var(--muted)">${escapeHtml(msg.text)}</em>`;
  else el.innerHTML = `<strong>${escapeHtml(msg.from)}:</strong> ${escapeHtml(msg.text)}`;
  messagesEl.appendChild(el); messagesEl.scrollTop = messagesEl.scrollHeight;
}

function formatTime(sec){ const m=Math.floor(sec/60).toString().padStart(2,'0'); const s=(sec%60).toString().padStart(2,'0'); return `${m}:${s}` }
function escapeHtml(s){ return String(s).replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch])) }

// minimal fallback CSS copy (in case /style.css isn't present). Append to head.
(function(){
  const css = `:root{--bg:#0f1724;--card:#0b1220;--muted:#94a3b8;--accent:#06b6d4;--red:#ef4444;--blue:#3b82f6;--green:#10b981;font-family:Inter, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial} *{box-sizing:border-box} body{margin:0;background:linear-gradient(180deg,#071129 0%, #071022 100%);color:#e6eef6;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px} .app{width:1100px;max-width:100%;min-height:640px;background:linear-gradient(180deg, rgba(255,255,255,0.02), transparent);border-radius:12px;padding:18px;box-shadow:0 8px 30px rgba(2,6,23,0.6);display:grid;grid-template-columns:320px 1fr;gap:16px} .sidebar{background:linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01));padding:14px;border-radius:10px} .box{background:rgba(255,255,255,0.02);padding:12px;border-radius:8px;margin-bottom:12px} .team{flex:1;padding:10px;border-radius:8px;text-align:center;cursor:pointer;border:2px dashed rgba(255,255,255,0.03)} .team.red{background:linear-gradient(180deg, rgba(239,68,68,0.12), rgba(239,68,68,0.06));border-color:rgba(239,68,68,0.18)} .team.blue{background:linear-gradient(180deg, rgba(59,130,246,0.12), rgba(59,130,246,0.06));border-color:rgba(59,130,246,0.18)} .players-list{display:flex;flex-direction:column;gap:6px;max-height:220px;overflow:auto} .player-item{display:flex;justify-content:space-between;align-items:center;padding:8px;border-radius:8px;background:rgba(255,255,255,0.01)} .badge{padding:4px 8px;border-radius:999px;font-size:12px} .badge.red{background:rgba(239,68,68,0.12);color:var(--red)} .badge.blue{background:rgba(59,130,246,0.12);color:var(--blue)} .main{display:flex;flex-direction:column;gap:12px} .stage{background:rgba(255,255,255,0.02);padding:14px;border-radius:10px;display:flex;flex-direction:column;gap:12px} .words-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px} .word-card{padding:10px;border-radius:8px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.02);min-height:48px;display:flex;flex-direction:column;justify-content:center} .word-card.guessed{background:linear-gradient(90deg,#052e13,#064e2f);border-color:rgba(16,185,129,0.2);color:var(--green)} .chat{height:160px;background:rgba(255,255,255,0.02);padding:10px;border-radius:8px;display:flex;flex-direction:column} .messages{flex:1;overflow:auto;padding-right:6px} .message{padding:6px;border-radius:6px;margin-bottom:6px;background:rgba(255,255,255,0.01)} .message.me{background:rgba(6,182,212,0.06);border-left:4px solid rgba(6,182,212,0.12)} .chat-input{display:flex;gap:8px;margin-top:8px} @media(max-width:900px){.app{grid-template-columns:1fr;min-height:800px}.sidebar{order:2}}`;
  const s=document.createElement('style'); s.textContent=css; document.head.appendChild(s);
})();

// request initial players list
socket.emit('requestState');


console.log('client loaded');
