//consts & states
const PIECES = {
  wK:'♔', wQ:'♕', wR:'♖', wB:'♗', wN:'♘', wP:'♙',
  bK:'♚', bQ:'♛', bR:'♜', bB:'♝', bN:'♞', bP:'♟'
};

const FILES = ['a','b','c','d','e','f','g','h'];
const RANKS = ['8','7','6','5','4','3','2','1'];

const TIMER_SECS = 10 * 60; // 10 minutes per side

let chess = new Chess();
let peer = null, conn = null;
let myColor = null; // 'w' or 'b'
let isHost = false;
let selected = null;
let validMoves = [];
let lastMove = null;
let timers = { w: TIMER_SECS, b: TIMER_SECS };
let timerInterval = null;
let gameOver = false;
let gameStarted = false;

(function() {
  const mb = document.getElementById('mini-board');
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const d = document.createElement('div');
      d.className = 'mini-sq ' + ((r+f)%2===0 ? 'l':'d');
      mb.appendChild(d);
    }
  }
})();

//peerjs
function genRoomId() {
  return Math.random().toString(36).slice(2,8).toUpperCase();
}

function initPeer(id) {
  peer = new Peer(id, {
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    }
  });

  peer.on('open', (peerId) => {
    console.log('Peer open:', peerId);
  });

  peer.on('error', (err) => {
    console.error('Peer error:', err);
    if (err.type === 'unavailable-id') {
      showJoinStatus('Room not found or already full.', 'error');
    } else {
      showBanner('Connection error: ' + err.message);
    }
    document.getElementById('create-btn').disabled = false;
    document.getElementById('join-btn').disabled = false;
    document.getElementById('join-input').disabled = false;
  });
}

//host
document.getElementById('create-btn').addEventListener('click', () => {
  const roomId = genRoomId();
  isHost = true;
  myColor = 'w';

  document.getElementById('create-btn').disabled = true;
  document.getElementById('join-btn').disabled = true;
  document.getElementById('join-input').disabled = true;

  initPeer('chess-' + roomId);

  peer.on('open', () => {
    document.getElementById('room-created').style.display = 'flex';
    document.getElementById('room-code-display').textContent = roomId;
    document.getElementById('waiting-pill').innerHTML =
      '<span class="pip"></span> Waiting for opponent…';
  });

  peer.on('connection', (c) => {
    conn = c;
    setupConn();
    const pill = document.getElementById('waiting-pill');
    pill.className = 'status-pill pill-connected';
    pill.innerHTML = '<span class="pip"></span> Opponent connected!';
  });
});

//copy
document.getElementById('copy-btn').addEventListener('click', () => {
  const code = document.getElementById('room-code-display').textContent;
  navigator.clipboard.writeText(code).then(() => {
    document.getElementById('copy-btn').textContent = 'Copied!';
    setTimeout(() => document.getElementById('copy-btn').textContent = 'Copy', 2000);
  });
});

//join
document.getElementById('join-btn').addEventListener('click', doJoin);
document.getElementById('join-input').addEventListener('keydown', e => { if (e.key==='Enter') doJoin(); });

function doJoin() {
  const raw = document.getElementById('join-input').value.trim().toUpperCase();
  if (!raw) { showJoinStatus('Please enter a room code.', 'warn'); return; }

  isHost = false;
  myColor = 'b';
  showJoinStatus('Connecting…', 'info');

  document.getElementById('create-btn').disabled = true;
  document.getElementById('join-btn').disabled = true;
  document.getElementById('join-input').disabled = true;

  initPeer(undefined); // random peer id for joiner

  peer.on('open', () => {
    conn = peer.connect('chess-' + raw, { reliable: true });
    setupConn();
    conn.on('error', () => {
      showJoinStatus('Could not reach that room.', 'error');
      document.getElementById('create-btn').disabled = false;
      document.getElementById('join-btn').disabled = false;
      document.getElementById('join-input').disabled = false;
    });
  });
}

function setupConn() {
  conn.on('open', () => {
    showBanner('Connected!', true);
    if (!isHost) {
      showJoinStatus('Connected! Starting…', 'ok');
    }
    if (!gameStarted) setTimeout(startGame, 500);
  });

  conn.on('data', handleData);

  conn.on('close', () => {
    if (!gameOver) showBanner('Opponent disconnected.');
  });
  conn.on('error', (e) => {
    console.error('Conn error:', e);
  });
}

function send(msg) {
  if (conn && conn.open) conn.send(JSON.stringify(msg));
}

function handleData(raw) {
  const msg = JSON.parse(raw);
  if (msg.type === 'move') {
    applyMove(msg.move, false);
  } else if (msg.type === 'resign') {
    endGame(myColor === 'w' ? 'White wins!' : 'Black wins!',
            'Opponent resigned. ' + (myColor==='w' ? 'White' : 'Black') + ' wins!', '🏳️');
  } else if (msg.type === 'new-game') {
    resetGame();
  }
}

function showJoinStatus(txt, type) {
  const el = document.getElementById('join-status');
  el.textContent = txt;
  el.style.color = type==='error' ? 'var(--danger)' : type==='ok' ? 'var(--success)' : 'var(--text-muted)';
}

//start
function startGame() {
  if (gameStarted) return;
  gameStarted = true;

  document.getElementById('lobby').classList.remove('active');
  document.getElementById('game').classList.add('active');

  if (myColor === 'w') {
    document.getElementById('name-bottom').textContent = 'You (White)';
    document.getElementById('color-bottom').textContent = 'WHITE';
    document.getElementById('name-top').textContent = 'Opponent (Black)';
    document.getElementById('color-top').textContent = 'BLACK';
    document.getElementById('strip-bottom').querySelector('.player-icon').textContent = '♙';
    document.getElementById('strip-top').querySelector('.player-icon').textContent = '♟';
  } else {
    document.getElementById('name-bottom').textContent = 'You (Black)';
    document.getElementById('color-bottom').textContent = 'BLACK';
    document.getElementById('name-top').textContent = 'Opponent (White)';
    document.getElementById('color-top').textContent = 'WHITE';
    document.getElementById('strip-bottom').querySelector('.player-icon').textContent = '♟';
    document.getElementById('strip-top').querySelector('.player-icon').textContent = '♙';
    document.getElementById('strip-bottom').querySelector('.icon-white').classList.replace('icon-white','icon-black');
    document.getElementById('strip-top').querySelector('.icon-black').classList.replace('icon-black','icon-white');
  }

  renderBoard();
  startTimer();
  updateStatus();
}

function resetGame() {
  chess = new Chess();
  selected = null;
  validMoves = [];
  lastMove = null;
  timers = { w: TIMER_SECS, b: TIMER_SECS };
  gameOver = false;
  document.getElementById('move-log').innerHTML = '';
  document.getElementById('game-over-overlay').classList.remove('show');
  clearInterval(timerInterval);
  renderBoard();
  startTimer();
  updateStatus();
}

//render
function renderBoard() {
  const board = document.getElementById('chessboard');
  board.innerHTML = '';

  const ranks = myColor === 'b' ? ['1','2','3','4','5','6','7','8'] : ['8','7','6','5','4','3','2','1'];
  const files = myColor === 'b' ? ['h','g','f','e','d','c','b','a'] : ['a','b','c','d','e','f','g','h'];

  const inCheckSq = getCheckSquare();

  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const rank = ranks[r];
      const file = files[f];
      const sq = file + rank;

      const isLight = (FILES.indexOf(file) + parseInt(rank)) % 2 === 1;
      const div = document.createElement('div');
      div.className = 'sq ' + (isLight ? 'light' : 'dark');
      div.dataset.sq = sq;

      if (f === 0) {
        const cr = document.createElement('span');
        cr.className = 'coord coord-rank';
        cr.textContent = rank;
        cr.style.color = isLight ? 'var(--dark-sq)' : 'var(--light-sq)';
        div.appendChild(cr);
      }
      if (r === 7) {
        const cf = document.createElement('span');
        cf.className = 'coord coord-file';
        cf.textContent = file;
        cf.style.color = isLight ? 'var(--dark-sq)' : 'var(--light-sq)';
        div.appendChild(cf);
      }

      if (lastMove) {
        if (sq === lastMove.from) div.classList.add('last-from');
        if (sq === lastMove.to)   div.classList.add('last-to');
      }

      if (selected === sq) div.classList.add('selected');

      const vm = validMoves.find(m => m.to === sq);
      if (vm) {
        div.classList.add(chess.get(sq) ? 'valid-capture' : 'valid-move');
      }

      if (inCheckSq && sq === inCheckSq) div.classList.add('in-check');

      const piece = chess.get(sq);
      if (piece) {
        const key = piece.color + piece.type.toUpperCase();
        const span = document.createElement('span');
        span.className = 'piece';
        span.textContent = PIECES[key];
        div.appendChild(span);
      }

      div.addEventListener('click', () => onSquareClick(sq));
      board.appendChild(div);
    }
  }
}

function getCheckSquare() {
  if (!chess.in_check()) return null;
  const turn = chess.turn();
  // find king
  for (let r of RANKS) {
    for (let f of FILES) {
      const p = chess.get(f + r);
      if (p && p.type === 'k' && p.color === turn) return f + r;
    }
  }
  return null;
}

//game
function onSquareClick(sq) {
  if (gameOver) return;
  if (chess.turn() !== myColor) return; // not your turn

  const piece = chess.get(sq);

  if (selected) {
    const move = validMoves.find(m => m.to === sq);
    if (move) {
      if (move.flags.includes('p')) {
        showPromoDialog(selected, sq);
        return;
      }
      doMove({ from: selected, to: sq });
      return;
    }
    if (piece && piece.color === myColor) {
      selected = sq;
      validMoves = chess.moves({ square: sq, verbose: true });
    } else {
      selected = null;
      validMoves = [];
    }
  } else {
    if (piece && piece.color === myColor) {
      selected = sq;
      validMoves = chess.moves({ square: sq, verbose: true });
    }
  }
  renderBoard();
}

function showPromoDialog(from, to) {
  const isWhite = myColor === 'w';
  const pieces = isWhite
    ? [['q','♕'],['r','♖'],['b','♗'],['n','♘']]
    : [['q','♛'],['r','♜'],['b','♝'],['n','♞']];
  const container = document.getElementById('promo-pieces');
  container.innerHTML = '';
  pieces.forEach(([type, glyph]) => {
    const btn = document.createElement('div');
    btn.className = 'promo-piece';
    btn.textContent = glyph;
    btn.onclick = () => {
      document.getElementById('promo-dialog').classList.remove('show');
      doMove({ from, to, promotion: type });
    };
    container.appendChild(btn);
  });
  document.getElementById('promo-dialog').classList.add('show');
}

function doMove(moveObj) {
  applyMove(moveObj, true);
  send({ type: 'move', move: moveObj });
}

function applyMove(moveObj, isMine) {
  const result = chess.move(moveObj);
  if (!result) return;

  lastMove = { from: result.from, to: result.to };
  selected = null;
  validMoves = [];

  updateMoveLog(result);
  renderBoard();
  updateStatus();
  updateCaptures();

  // Switch timer
  startTimer();

  if (chess.game_over()) {
    handleGameOver();
  }
}

//status
function updateStatus() {
  const el = document.getElementById('game-status');
  if (chess.in_checkmate()) {
    const winner = chess.turn() === 'w' ? 'Black' : 'White';
    el.innerHTML = `<strong>${winner} wins</strong> by checkmate`;
    el.className = 'game-status over';
  } else if (chess.in_stalemate()) {
    el.innerHTML = `<strong>Draw</strong> — Stalemate`;
    el.className = 'game-status over';
  } else if (chess.in_draw()) {
    el.innerHTML = `<strong>Draw</strong>`;
    el.className = 'game-status over';
  } else if (chess.in_check()) {
    const inCheck = chess.turn() === 'w' ? 'White' : 'Black';
    el.innerHTML = `<strong>${inCheck} is in check!</strong>`;
    el.className = 'game-status in-check';
  } else {
    const turn = chess.turn() === 'w' ? 'White' : 'Black';
    const yours = chess.turn() === myColor;
    el.innerHTML = `<strong>${turn}</strong> to move${yours ? ' — <em style="color:var(--success)">your turn</em>' : ''}`;
    el.className = 'game-status';
  }

  const isWhiteTurn = chess.turn() === 'w';
  const bottomIsWhite = myColor === 'w';
  document.getElementById('strip-bottom').classList.toggle('active-turn',
    isWhiteTurn === bottomIsWhite);
  document.getElementById('strip-top').classList.toggle('active-turn',
    isWhiteTurn !== bottomIsWhite);
}

function updateMoveLog(move) {
  const log = document.getElementById('move-log');
  const moves = chess.history({ verbose: true });
  const num = Math.ceil(moves.length / 2);
  const isWhiteMove = move.color === 'w';

  log.querySelectorAll('.move-latest').forEach(el => el.classList.remove('move-latest'));

  if (isWhiteMove) {
    const row = document.createElement('div');
    row.className = 'move-row';
    row.dataset.num = num;
    row.innerHTML = `<span class="move-num">${num}.</span><span class="move-white move-latest">${move.san}</span><span class="move-black"></span>`;
    log.appendChild(row);
  } else {
    const lastRow = log.querySelector(`[data-num="${num}"]`);
    if (lastRow) {
      lastRow.querySelector('.move-black').textContent = move.san;
      lastRow.querySelector('.move-black').classList.add('move-latest');
    }
  }
  log.scrollTop = log.scrollHeight;
}

function updateCaptures() {
  const history = chess.history({ verbose: true });
  const caps = { w: [], b: [] };
  history.forEach(m => {
    if (m.captured) {
      caps[m.color].push(PIECES[(m.color==='w'?'b':'w') + m.captured.toUpperCase()]);
    }
  });
  if (myColor === 'w') {
    document.getElementById('cap-bottom').textContent = caps.w.join('');
    document.getElementById('cap-top').textContent = caps.b.join('');
  } else {
    document.getElementById('cap-bottom').textContent = caps.b.join('');
    document.getElementById('cap-top').textContent = caps.w.join('');
  }
}

//time
function startTimer() {
  clearInterval(timerInterval);
  if (gameOver) return;
  const activeSide = chess.turn();
  timerInterval = setInterval(() => {
    timers[activeSide]--;
    updateTimerDisplay();
    if (timers[activeSide] <= 0) {
      clearInterval(timerInterval);
      const winner = activeSide === 'w' ? 'Black' : 'White';
      endGame(`${winner} wins!`, `${activeSide==='w'?'White':'Black'} ran out of time. ${winner} wins!`, '⏱️');
    }
  }, 1000);
}

function formatTime(secs) {
  const m = Math.floor(secs / 60).toString().padStart(2,'0');
  const s = (secs % 60).toString().padStart(2,'0');
  return `${m}:${s}`;
}

function updateTimerDisplay() {
  if (myColor === 'w') {
    document.getElementById('timer-bottom').textContent = formatTime(timers.w);
    document.getElementById('timer-top').textContent = formatTime(timers.b);
  } else {
    document.getElementById('timer-bottom').textContent = formatTime(timers.b);
    document.getElementById('timer-top').textContent = formatTime(timers.w);
  }
  ['w','b'].forEach(c => {
    const el = document.getElementById(c === myColor ? 'timer-bottom' : 'timer-top');
    el.style.color = timers[c] <= 30 ? 'var(--danger)' : 'var(--text)';
  });
}

//gameover
function handleGameOver() {
  clearInterval(timerInterval);
  gameOver = true;
  let title, desc, icon;
  if (chess.in_checkmate()) {
    const winner = chess.turn() === 'w' ? 'Black' : 'White';
    const iWin = (winner.toLowerCase()[0]) === myColor;
    title = iWin ? 'You Win!' : 'You Lose';
    desc = `${winner} wins by checkmate.`;
    icon = iWin ? '♛' : '♟';
  } else if (chess.in_stalemate()) {
    title = 'Stalemate'; desc = 'The game is a draw by stalemate.'; icon = '⚖️';
  } else {
    title = 'Draw'; desc = 'The game ended in a draw.'; icon = '⚖️';
  }
  endGame(title, desc, icon);
}

function endGame(title, desc, icon) {
  gameOver = true;
  clearInterval(timerInterval);
  document.getElementById('over-title').textContent = title;
  document.getElementById('over-desc').textContent = desc;
  document.getElementById('over-icon').textContent = icon;
  document.getElementById('game-over-overlay').classList.add('show');
}

//resign
document.getElementById('resign-btn').addEventListener('click', () => {
  if (gameOver) return;
  if (!confirm('Are you sure you want to resign?')) return;
  send({ type: 'resign' });
  const winner = myColor === 'w' ? 'Black' : 'White';
  endGame(`${winner} wins!`, `You resigned. ${winner} wins!`, '🏳️');
});

//playagain
document.getElementById('play-again-btn').addEventListener('click', () => {
  send({ type: 'new-game' });
  resetGame();
});

//timeout
let bannerTimeout;
function showBanner(msg, good) {
  const b = document.getElementById('conn-banner');
  const t = document.getElementById('conn-text');
  t.textContent = msg;
  b.style.borderColor = good ? 'var(--success)' : 'var(--border)';
  b.classList.add('show');
  clearTimeout(bannerTimeout);
  bannerTimeout = setTimeout(() => b.classList.remove('show'), 3000);
}