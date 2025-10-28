// server.js — Node + Express + Socket.io server for Taboo-style game
// Run: npm install && node server.js

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;

// Word pool with points
const WORDS = [
  ['apple',5],['giraffe',10],['spaceship',20],['philosophy',45],['ocean',10],['metropolis',30],['burrito',15],['pyramid',25],['quantum',50],['kangaroo',20],
  ['sunflower',10],['algorithm',40],['marshmallow',8],['helicopter',35],['volcano',30],['penguin',12],['jazz',18],['machinery',28],['tornado',22],['saxophone',38],
  ['island',10],['microscope',25],['revolver',30],['constellation',45],['cactus',8],['chocolate',12],['zeppelin',40],['laboratory',32],['compass',15],['violin',20]
];

// In-memory game state (single room demo)
const game = {
  players: {}, // socketId -> {id,name,team,score}
  order: [], // socketId order
  operatorId: null,
  round: 0,
  totalRounds: 6,
  roundTime: 120,
  timer: null,
  timeStarted: null,
  timeLeft: 0,
  currentWords: [], // {text,points,guessed:false}
  scores: {red:0,blue:0},
  status: 'waiting' // waiting, in-round, ended
};

function broadcastPlayers(){
  const players = game.order.map(id=>({id, ...game.players[id]}));
  io.emit('players', players);
}

function pickRandomWords(n){
  const pool = WORDS.slice();
  const picked = [];
  while(picked.length<n && pool.length){
    const i = Math.floor(Math.random()*pool.length);
    picked.push(pool.splice(i,1)[0]);
  }
  return picked.map(w=>({text:w[0],points:w[1],guessed:false}));
}

function startTimer(){
  clearTimer();
  game.timeLeft = game.roundTime;
  game.timeStarted = Date.now();
  game.timer = setInterval(()=>{
    game.timeLeft -= 1;
    io.emit('timer', game.timeLeft);
    if(game.timeLeft <= 0){
      clearTimer();
      endRound();
    }
  }, 1000);
}
function clearTimer(){ if(game.timer){ clearInterval(game.timer); game.timer = null }}

function endRound(){
  // tally guessed points to operator's team
  const guessed = game.currentWords.filter(w=>w.guessed);
  const pts = guessed.reduce((s,w)=>s+w.points,0);
  const op = game.players[game.operatorId];
  if(op){
    game.scores[op.team] += pts;
    io.emit('system', `${op.name} (operator) scored ${pts} points for ${op.team.toUpperCase()}.`);
  } else {
    io.emit('system', `Round ended. ${pts} points unassigned (no operator).`);
  }
  io.emit('roundEnded', {guessedCount:guessed.length, pts, scores:game.scores});
  game.operatorId = null;
  game.currentWords = [];
  game.status = game.round >= game.totalRounds ? 'ended' : 'waiting';
  io.emit('gameState', getGamePublicState());
  if(game.status === 'ended'){
    const winner = game.scores.red === game.scores.blue ? 'Draw' : (game.scores.red > game.scores.blue ? 'Red' : 'Blue');
    io.emit('system', `Game over — ${winner}. Final: Red ${game.scores.red} — Blue ${game.scores.blue}`);
  }
}

function getGamePublicState(){
  return {
    operatorId: game.operatorId,
    round: game.round,
    totalRounds: game.totalRounds,
    roundTime: game.roundTime,
    timeLeft: game.timeLeft,
    currentWords: game.currentWords.map(w=>({text: w.guessed ? w.text : null, points: w.guessed ? w.points : null, guessed: w.guessed})),
    scores: game.scores,
    status: game.status
  };
}

io.on('connection', socket=>{
  console.log('conn', socket.id);

  // send initial state
  socket.emit('welcome', {id: socket.id});
  socket.emit('gameState', getGamePublicState());
  broadcastPlayers();

  socket.on('setName', ({name})=>{
    if(!name) return;
    game.players[socket.id] = game.players[socket.id] || {name,team:null,score:0};
    game.players[socket.id].name = name;
    if(!game.order.includes(socket.id)) game.order.push(socket.id);
    io.emit('system', `${name} joined the lobby.`);
    broadcastPlayers();
  });

  socket.on('joinTeam', ({team})=>{
    if(!game.players[socket.id]) return;
    game.players[socket.id].team = team;
    io.emit('system', `${game.players[socket.id].name} joined ${team.toUpperCase()} team.`);
    broadcastPlayers();
  });

  socket.on('becomeOperator', ()=>{
    if(!game.players[socket.id] || !game.players[socket.id].team) return;
    game.operatorId = socket.id;
    io.emit('system', `${game.players[socket.id].name} is now operator.`);
    io.emit('gameState', getGamePublicState());
  });

  socket.on('startRound', ()=>{
    if(game.status === 'in-round') return;
    game.round += 1;
    game.currentWords = pickRandomWords(20);
    game.status = 'in-round';
    startTimer();
    io.emit('system', `Round ${game.round} started.`);
    io.emit('gameState', getGamePublicState());
    io.emit('words', {words: game.currentWords}); // operator can receive full list if needed
  });

  socket.on('revealWords', ()=>{
    // only operator
    if(game.operatorId !== socket.id) return;
    io.to(socket.id).emit('wordsReveal', {words: game.currentWords});
  });

  socket.on('shuffleWords', ()=>{
    // operator only
    if(game.operatorId !== socket.id) return;
    game.currentWords.sort(()=>Math.random()-0.5);
    io.emit('system', `${game.players[socket.id].name} shuffled words.`);
    io.emit('gameState', getGamePublicState());
  });

  socket.on('clearGuesses', ()=>{
    if(game.operatorId !== socket.id) return;
    game.currentWords.forEach(w=>w.guessed=false);
    io.emit('system', 'Operator cleared guesses.');
    io.emit('gameState', getGamePublicState());
  });

  socket.on('guess', ({text})=>{
    if(game.status !== 'in-round') return;
    if(!game.players[socket.id]) return;
    const lowered = String(text||'').trim().toLowerCase();
    if(!lowered) return;
    // find match
    const match = game.currentWords.find(w=>!w.guessed && w.text.toLowerCase() === lowered);
    if(match){
      match.guessed = true;
      io.emit('system', `${game.players[socket.id].name} guessed "${match.text}" (+${match.points})`);
      io.emit('gameState', getGamePublicState());
    }
  });

  socket.on('chat', ({text})=>{
    if(!game.players[socket.id]) return;
    io.emit('chat', {from: game.players[socket.id].name, text});
  });

  socket.on('nextRound', ()=>{
    clearTimer();
    endRound();
    io.emit('gameState', getGamePublicState());
  });

  socket.on('endGame', ()=>{
    // reset
    game.players = {};
    game.order = [];
    game.operatorId = null;
    game.round = 0;
    game.scores = {red:0,blue:0};
    game.currentWords = [];
    game.status = 'waiting';
    clearTimer();
    io.emit('system', 'Game ended and reset.');
    io.emit('gameState', getGamePublicState());
    broadcastPlayers();
  });

  socket.on('disconnect', ()=>{
    const p = game.players[socket.id];
    if(p){
      io.emit('system', `${p.name} disconnected.`);
    }
    delete game.players[socket.id];
    game.order = game.order.filter(id=>id!==socket.id);
    if(game.operatorId === socket.id) game.operatorId = null;
    broadcastPlayers();
  });
});

server.listen(PORT, ()=>console.log(`Server listening on http://localhost:${PORT}`));