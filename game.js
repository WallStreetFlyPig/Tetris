/* Browser presentation, input, optional audio and local records. */
(() => {
  'use strict';
  const {Game, WIDTH, HEIGHT, HIDDEN, SHAPES, COLORS} = TetrisCore;
  const game = new Game();
  const $ = id => document.getElementById(id);
  const board = $('board');
  const context = board.getContext('2d');
  const help = $('help-dialog');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const storage = {
    get(key, fallback) { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } },
    set(key, value) { try { localStorage.setItem(key, String(value)); } catch { /* Play normally when storage is unavailable. */ } }
  };
  let best = Math.max(0, Number(storage.get('blockfall.best.v1', 0)) || 0);
  let sound = storage.get('blockfall.sound.v1', 'off') === 'on';
  let audioContext;
  let lastTime = 0;
  let horizontalElapsed = 0;
  let repeating = false;
  let heldDirection = 0;
  let lastStatus = '';
  let lastStats = '';
  let announcementTimer;
  const pressed = new Set();
  const movementKeys = new Set(['ArrowLeft','ArrowRight','ArrowDown','ArrowUp','KeyA','KeyD','KeyS','KeyW','KeyX','KeyZ','KeyC','Space']);
  const actionKeys = new Set([...movementKeys, 'Enter','KeyP','Escape','KeyM','Slash']);

  function enableAudio() {
    if (!sound) return;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      if (!audioContext) audioContext = new Audio();
      if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    } catch { /* Audio is optional. */ }
  }
  function tone(frequency, duration = 0.08, delay = 0, volume = 0.035, type = 'sine') {
    if (!sound || !audioContext || audioContext.state !== 'running') return;
    try {
      const start = audioContext.currentTime + delay;
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(volume, start + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.01);
    } catch { /* A denied audio device must not interrupt play. */ }
  }
  function updateSoundButton() {
    $('sound-button').setAttribute('aria-pressed', String(sound));
    $('sound-button').setAttribute('aria-label', sound ? '关闭音效' : '开启音效');
    $('sound-waves').setAttribute('d', sound ? 'M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14' : 'm16 9 5 6m0-6-5 6');
  }
  function toggleSound() {
    sound = !sound;
    storage.set('blockfall.sound.v1', sound ? 'on' : 'off');
    enableAudio();
    updateSoundButton();
    tone(660);
  }
  function resetInput() {
    pressed.clear();
    heldDirection = 0;
    horizontalElapsed = 0;
    repeating = false;
  }
  function announce(text) {
    $('live-status').textContent = text;
  }
  function start() {
    if (help.open) return;
    enableAudio();
    resetInput();
    game.start();
    $('board-fx').replaceChildren();
    $('play-announcement').classList.remove('show');
    clearTimeout(announcementTimer);
    flushEvents();
    updateUI();
    board.focus({preventScroll:true});
    tone(392, .1); tone(523.25, .15, .1);
  }
  function pause() {
    if (game.pause()) {
      resetInput();
      flushEvents();
      updateUI();
    }
  }
  function resume() {
    if (help.open) return;
    enableAudio();
    if (game.resume()) {
      resetInput();
      lastTime = performance.now();
      flushEvents();
      updateUI();
      board.focus({preventScroll:true});
    }
  }
  function togglePause() {
    if (game.status === 'running') pause();
    else if (game.status === 'paused') resume();
  }
  function openHelp() {
    if (help.open) return;
    pause();
    resetInput();
    help.showModal();
  }
  function closeHelp() {
    help.close();
    resetInput();
    // Closing help leaves the visible pause screen in control of resuming.
    if (game.status === 'paused') $('primary-button').focus();
  }
  function runAction(code) {
    enableAudio();
    if (code === 'ArrowLeft' || code === 'KeyA') game.move(-1);
    else if (code === 'ArrowRight' || code === 'KeyD') game.move(1);
    else if (code === 'ArrowUp' || code === 'KeyX' || code === 'KeyW') game.rotate(1);
    else if (code === 'KeyZ') game.rotate(-1);
    else if (code === 'ArrowDown' || code === 'KeyS') game.fall(true);
    else if (code === 'Space') game.hardDrop();
    else if (code === 'KeyC') game.swapHold();
    flushEvents();
    updateUI();
  }
  document.addEventListener('keydown', event => {
    if (!actionKeys.has(event.code)) return;
    // Preserve native Enter/Space activation on buttons and in the modal.
    if (help.open) {
      if (movementKeys.has(event.code) && !['Space'].includes(event.code)) event.preventDefault();
      return;
    }
    if ((event.code === 'Enter' || event.code === 'Space') && event.target.closest('button,a')) return;
    event.preventDefault();
    if (event.repeat || pressed.has(event.code)) return;
    if (event.code === 'KeyM') { toggleSound(); return; }
    if (event.code === 'Slash' && event.shiftKey) { openHelp(); return; }
    if (event.code === 'Enter' && game.status !== 'running') {
      if (game.status === 'paused') resume(); else start();
      return;
    }
    if (event.code === 'KeyP' || event.code === 'Escape') { togglePause(); return; }
    if (game.status !== 'running') return;
    pressed.add(event.code);
    if (['ArrowLeft','ArrowRight','KeyA','KeyD'].includes(event.code)) {
      heldDirection = ['ArrowLeft','KeyA'].includes(event.code) ? -1 : 1;
      horizontalElapsed = 0;
      repeating = false;
    }
    runAction(event.code);
  });
  document.addEventListener('keyup', event => {
    pressed.delete(event.code);
    if (['ArrowLeft','ArrowRight','KeyA','KeyD'].includes(event.code)) {
      const left = pressed.has('ArrowLeft') || pressed.has('KeyA');
      const right = pressed.has('ArrowRight') || pressed.has('KeyD');
      heldDirection = right ? 1 : left ? -1 : 0;
      horizontalElapsed = 0;
      repeating = false;
    }
  });
  window.addEventListener('blur', pause);
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  help.addEventListener('close', resetInput);
  $('sound-button').addEventListener('click', toggleSound);
  $('help-button').addEventListener('click', openHelp);
  $('close-help').addEventListener('click', closeHelp);
  $('help-done').addEventListener('click', closeHelp);
  $('primary-button').addEventListener('click', () => game.status === 'paused' ? resume() : start());
  $('pause-button').addEventListener('click', togglePause);
  $('restart-button').addEventListener('click', start);

  function showMessage(title, detail) {
    const element = $('play-announcement');
    element.replaceChildren(document.createTextNode(title));
    if (detail) { const small = document.createElement('small'); small.textContent = detail; element.append(small); }
    element.classList.remove('show');
    void element.offsetWidth;
    element.classList.add('show');
    clearTimeout(announcementTimer);
    announcementTimer = setTimeout(() => element.classList.remove('show'), 1250);
  }
  function clearEffects(event) {
    if (reducedMotion.matches) return;
    const effects = $('board-fx');
    for (const row of event.rows) {
      if (row < HIDDEN) continue;
      const line = document.createElement('i');
      line.className = 'clear-flash';
      line.style.top = `${(row - HIDDEN) / HEIGHT * 100}%`;
      line.style.height = `${100 / HEIGHT}%`;
      effects.append(line);
      line.addEventListener('animationend', () => line.remove(), {once:true});
      for (let i = 0; i < 12; i++) {
        const particle = document.createElement('i');
        particle.className = 'particle';
        particle.style.left = `${Math.random() * 100}%`;
        particle.style.top = `${(row - HIDDEN + .5) / HEIGHT * 100}%`;
        particle.style.background = Object.values(COLORS)[i % 7];
        particle.style.setProperty('--dx', `${(Math.random() - .5) * 70}px`);
        particle.style.setProperty('--dy', `${-10 - Math.random() * 65}px`);
        effects.append(particle);
        particle.addEventListener('animationend', () => particle.remove(), {once:true});
      }
    }
  }
  function flushEvents() {
    for (const event of game.drainEvents()) {
      if (event.type === 'rotate') tone(330, .035, 0, .015);
      if (event.type === 'hold') tone(440, .06, 0, .02);
      if (event.type === 'drop') {
        tone(130, .09, 0, .04, 'triangle');
        if (!reducedMotion.matches) {
          $('board-frame').classList.remove('dropped');
          void $('board-frame').offsetWidth;
          $('board-frame').classList.add('dropped');
        }
      }
      if (event.type === 'clear') {
        clearEffects(event);
        const name = ['','SINGLE','DOUBLE','TRIPLE','TETRIS!'][event.count];
        showMessage(name, `${event.b2bBonus ? 'BACK TO BACK · ' : ''}+${event.points}${event.combo > 0 ? ` · ${event.combo + 1} COMBO` : ''}`);
        [523.25,659.25,783.99,1046.5].slice(0, event.count).forEach((frequency, i) => tone(frequency, .16, i * .065));
        announce(`消除 ${event.count} 行，获得 ${event.points} 分。当前分数 ${game.score}。`);
      }
      if (event.type === 'level') {
        showMessage(`LEVEL ${String(event.level).padStart(2,'0')}`, '节奏，加快一点。');
        announce(`进入第 ${event.level} 级。`);
      }
      if (event.type === 'start') announce('游戏开始。方向键移动和旋转，空格直接落底，P 暂停。');
      if (event.type === 'pause') announce('游戏已暂停。按 P 或点击继续游戏恢复。');
      if (event.type === 'resume') announce('继续游戏。');
      if (event.type === 'over') {
        resetInput();
        tone(294, .18); tone(220, .18, .15); tone(147, .3, .3);
        announce(`游戏结束。分数 ${game.score}，消除 ${game.lines} 行。`);
      }
    }
  }
  function updateUI() {
    if (game.score > best) { best = game.score; storage.set('blockfall.best.v1', best); }
    const stats = [game.score, best, game.level, game.lines, game.hold, game.canHold, ...game.next].join('|');
    if (stats !== lastStats) {
      lastStats = stats;
      $('score').textContent = String(game.score).padStart(6,'0');
      $('score').style.fontSize = game.score >= 10000000 ? '25px' : '';
      $('best-score').textContent = best.toLocaleString('en-US');
      $('level').textContent = String(game.level).padStart(2,'0');
      $('lines').textContent = game.lines;
      $('level-fill').style.width = `${game.lines % 10 * 10}%`;
      $('level-progress').setAttribute('aria-valuenow', game.lines % 10);
      $('lines-to-level').textContent = 10 - game.lines % 10;
      $('hold-placeholder').hidden = !!game.hold;
      $('hold-hint').textContent = game.canHold ? '每个方块可交换一次' : '落下当前方块后可再次交换';
      $('hold-canvas').style.opacity = game.canHold ? '1' : '.45';
      $('hold-canvas').setAttribute('aria-label', game.hold ? `暂存方块 ${game.hold}` : '暂无暂存方块');
      for (let i = 0; i < 3; i++) $(`next-${i}`).setAttribute('aria-label', `第 ${i + 1} 个待落方块 ${game.next[i]}`);
      drawPreviews();
    }
    if (game.status !== lastStatus) {
      lastStatus = game.status;
      const running = game.status === 'running';
      const paused = game.status === 'paused';
      const over = game.status === 'over';
      $('status-label').textContent = {ready:'准备就绪',running:'挑战进行中',paused:'休息一下',over:'本局已结束'}[game.status];
      $('status-dot').className = running ? 'running' : '';
      $('game-overlay').hidden = running;
      $('pause-button').disabled = !running && !paused;
      $('pause-label').textContent = paused ? '继续' : '暂停';
      $('overlay-title').textContent = paused ? '好节奏，也需要留白。' : over ? '每一次，都是新开始。' : '下一块，刚刚好。';
      $('overlay-eyebrow').textContent = paused ? 'TAKE A LITTLE BREAK' : over ? 'ONE MORE POSSIBILITY' : 'A LITTLE SPACE TO PLAY';
      $('overlay-description').textContent = paused ? '方块在等你，准备好了再继续。' : over ? `本局得分 ${game.score.toLocaleString('en-US')} · 消除 ${game.lines} 行` : '从第一块开始，创造属于你的消行节奏。';
      $('primary-label').textContent = paused ? '继续游戏' : over ? '再来一局' : '开始游戏';
      $('overlay-shortcut').textContent = paused ? '或按 P / ENTER 继续' : '或按 ENTER 开始';
    }
  }
  function setupCanvas(canvas) {
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 3);
    const width = Math.max(1, Math.round(rect.width * ratio));
    const height = Math.max(1, Math.round(rect.height * ratio));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(ratio,0,0,ratio,0,0);
    return {ctx,width:rect.width,height:rect.height};
  }
  function block(ctx, x, y, size, color, ghost = false) {
    const gap = Math.max(1.3, size * .055);
    const side = size - gap * 2;
    const radius = Math.max(2, size * .1);
    ctx.beginPath();
    ctx.roundRect(x + gap, y + gap, side, side, radius);
    if (ghost) {
      ctx.fillStyle = color + '09';
      ctx.strokeStyle = color + '66';
      ctx.lineWidth = 1.2;
      ctx.fill(); ctx.stroke();
    } else {
      const gradient = ctx.createLinearGradient(x, y, x + size, y + size);
      gradient.addColorStop(0, color);
      gradient.addColorStop(1, color + 'c4');
      ctx.fillStyle = gradient;
      ctx.fill();
      ctx.strokeStyle = '#ffffff33'; ctx.lineWidth = .7; ctx.stroke();
      ctx.fillStyle = '#ffffff26'; ctx.fillRect(x + gap + 3, y + gap + 2, Math.max(0, side - 6), 1);
      ctx.fillStyle = '#00000014'; ctx.fillRect(x + gap + 2, y + size - gap - 4, Math.max(0, side - 4), 2);
    }
  }
  let boardWidth = 300, boardHeight = 600;
  function resize() {
    const dimensions = setupCanvas(board);
    boardWidth = dimensions.width;
    boardHeight = dimensions.height;
    drawPreviews();
    drawBoard();
  }
  function drawBoard() {
    const cell = boardWidth / WIDTH;
    context.clearRect(0,0,boardWidth,boardHeight);
    context.fillStyle = '#12141f'; context.fillRect(0,0,boardWidth,boardHeight);
    context.strokeStyle = '#ffffff04'; context.lineWidth = .7;
    context.beginPath();
    for (let x = 1; x < WIDTH; x++) { context.moveTo(x * cell,0); context.lineTo(x * cell,boardHeight); }
    for (let y = 1; y < HEIGHT; y++) { context.moveTo(0,y * cell); context.lineTo(boardWidth,y * cell); }
    context.stroke();
    for (let y = HIDDEN; y < game.board.length; y++) {
      for (let x = 0; x < WIDTH; x++) {
        if (game.board[y][x]) block(context,x * cell,(y - HIDDEN) * cell,cell,COLORS[game.board[y][x]]);
      }
    }
    if (game.current && game.status !== 'over') {
      const ghost = {...game.current, y:game.ghostY()};
      for (const {x,y} of game.cells(ghost)) if (y >= HIDDEN) block(context,x * cell,(y - HIDDEN) * cell,cell,COLORS[game.current.type],true);
      for (const {x,y} of game.cells()) if (y >= HIDDEN) block(context,x * cell,(y - HIDDEN) * cell,cell,COLORS[game.current.type]);
    }
  }
  function drawPreview(canvas, type, size) {
    const {ctx,width,height} = setupCanvas(canvas);
    ctx.clearRect(0,0,width,height);
    if (!type) return;
    const matrix = SHAPES[type];
    const cells = [];
    matrix.forEach((row,y) => row.forEach((filled,x) => { if (filled) cells.push({x,y}); }));
    const minX = Math.min(...cells.map(c => c.x)), maxX = Math.max(...cells.map(c => c.x));
    const minY = Math.min(...cells.map(c => c.y)), maxY = Math.max(...cells.map(c => c.y));
    const offsetX = (width - (maxX - minX + 1) * size) / 2;
    const offsetY = (height - (maxY - minY + 1) * size) / 2;
    for (const {x,y} of cells) block(ctx, offsetX + (x - minX) * size, offsetY + (y - minY) * size, size, COLORS[type]);
  }
  function drawPreviews() {
    drawPreview($('hold-canvas'),game.hold,23);
    for (let i = 0; i < 3; i++) drawPreview($(`next-${i}`),game.next[i],i === 0 ? 23 : 18);
  }
  function frame(now) {
    const dt = lastTime ? Math.min(now - lastTime, 50) : 0;
    lastTime = now;
    if (game.status === 'running') {
      if (heldDirection) {
        horizontalElapsed += dt;
        const delay = repeating ? 45 : 155;
        if (horizontalElapsed >= delay) {
          horizontalElapsed -= delay;
          repeating = true;
          game.move(heldDirection);
        }
      }
      game.tick(dt, pressed.has('ArrowDown') || pressed.has('KeyS'));
      flushEvents();
      updateUI();
      drawBoard();
    }
    requestAnimationFrame(frame);
  }
  window.addEventListener('resize', resize);
  new ResizeObserver(resize).observe(board);
  updateSoundButton();
  updateUI();
  resize();
  requestAnimationFrame(frame);
})();
