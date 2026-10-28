/* Pure game rules. Runs in both the browser and Node.js, without dependencies. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TetrisCore = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const WIDTH = 10, HEIGHT = 20, HIDDEN = 2, ROWS = HEIGHT + HIDDEN;
  const TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
  const COLORS = { I: '#62d9ed', O: '#f2ca68', T: '#ad8cf5', S: '#79dba3', Z: '#f57f91', J: '#729ff3', L: '#eda16f' };
  const SHAPES = {
    I: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
    O: [[1,1],[1,1]],
    T: [[0,1,0],[1,1,1],[0,0,0]],
    S: [[0,1,1],[1,1,0],[0,0,0]],
    Z: [[1,1,0],[0,1,1],[0,0,0]],
    J: [[1,0,0],[1,1,1],[0,0,0]],
    L: [[0,0,1],[1,1,1],[0,0,0]]
  };
  // SRS offsets use positive Y upward; the board uses positive Y downward.
  const KICKS = {
    '0>1': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
    '1>0': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
    '1>2': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
    '2>1': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
    '2>3': [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
    '3>2': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
    '3>0': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
    '0>3': [[0,0],[1,0],[1,1],[0,-2],[1,-2]]
  };
  const I_KICKS = {
    '0>1': [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
    '1>0': [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
    '1>2': [[0,0],[-1,0],[2,0],[-1,2],[2,-1]],
    '2>1': [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
    '2>3': [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
    '3>2': [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
    '3>0': [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
    '0>3': [[0,0],[-1,0],[2,0],[-1,2],[2,-1]]
  };
  const copy = matrix => matrix.map(row => row.slice());
  const rotateMatrix = matrix => matrix[0].map((_, x) => matrix.map(row => row[x]).reverse());
  const emptyBoard = () => Array.from({length: ROWS}, () => Array(WIDTH).fill(null));

  class Game {
    constructor(random = Math.random) {
      this.random = random;
      this.reset();
    }
    reset() {
      this.board = emptyBoard();
      this.bag = [];
      this.next = [];
      this.current = null;
      this.hold = null;
      this.canHold = true;
      this.score = 0;
      this.lines = 0;
      this.level = 1;
      this.combo = -1;
      this.backToBack = false;
      this.status = 'ready';
      this.events = [];
      this.gravityElapsed = 0;
      this.lockElapsed = 0;
      this.lockResets = 0;
      this.fillQueue();
    }
    emit(type, detail = {}) { this.events.push({type, ...detail}); }
    drainEvents() { return this.events.splice(0); }
    fillQueue() {
      while (this.next.length < 6) {
        if (!this.bag.length) {
          this.bag = TYPES.slice();
          for (let i = this.bag.length - 1; i > 0; i--) {
            const j = Math.floor(this.random() * (i + 1));
            [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
          }
        }
        this.next.push(this.bag.pop());
      }
    }
    start() {
      this.reset();
      this.status = 'running';
      this.spawn();
      this.emit('start');
    }
    spawn(type, canHold = true) {
      if (!type) {
        this.fillQueue();
        type = this.next.shift();
        this.fillQueue();
      }
      const matrix = copy(SHAPES[type]);
      this.current = {type, matrix, rotation: 0, x: Math.floor((WIDTH - matrix.length) / 2), y: HIDDEN};
      this.canHold = canHold;
      this.gravityElapsed = 0;
      this.lockElapsed = 0;
      this.lockResets = 0;
      if (this.collides(this.current)) this.end();
      else this.emit('spawn', {piece: type});
    }
    cells(piece = this.current) {
      if (!piece) return [];
      const cells = [];
      piece.matrix.forEach((row, y) => row.forEach((filled, x) => {
        if (filled) cells.push({x: piece.x + x, y: piece.y + y});
      }));
      return cells;
    }
    collides(piece) {
      return this.cells(piece).some(({x,y}) => x < 0 || x >= WIDTH || y < 0 || y >= ROWS || this.board[y][x] !== null);
    }
    grounded() { return !!this.current && this.collides({...this.current, y: this.current.y + 1}); }
    adjusted(wasGrounded) {
      if (wasGrounded && this.lockResets < 15) {
        this.lockElapsed = 0;
        this.lockResets++;
      }
      if (!this.grounded()) this.lockElapsed = 0;
    }
    move(dx) {
      if (this.status !== 'running' || ![-1,1].includes(dx)) return false;
      const moved = {...this.current, x: this.current.x + dx};
      if (this.collides(moved)) return false;
      const wasGrounded = this.grounded();
      this.current = moved;
      this.adjusted(wasGrounded);
      this.emit('move');
      return true;
    }
    rotate(direction = 1) {
      if (this.status !== 'running' || this.current.type === 'O') return false;
      const piece = this.current;
      const rotation = (piece.rotation + (direction === -1 ? 3 : 1)) % 4;
      let matrix = copy(piece.matrix);
      for (let i = 0; i < (direction === -1 ? 3 : 1); i++) matrix = rotateMatrix(matrix);
      const table = piece.type === 'I' ? I_KICKS : KICKS;
      for (const [dx, dy] of table[`${piece.rotation}>${rotation}`]) {
        const rotated = {...piece, matrix, rotation, x: piece.x + dx, y: piece.y - dy};
        if (!this.collides(rotated)) {
          const wasGrounded = this.grounded();
          this.current = rotated;
          this.adjusted(wasGrounded);
          this.emit('rotate');
          return true;
        }
      }
      return false;
    }
    fall(soft = false) {
      if (this.status !== 'running') return false;
      const moved = {...this.current, y: this.current.y + 1};
      if (this.collides(moved)) return false;
      this.current = moved;
      this.lockElapsed = 0;
      if (soft) this.score++;
      return true;
    }
    ghostY() {
      if (!this.current) return HIDDEN;
      let y = this.current.y;
      while (!this.collides({...this.current, y: y + 1})) y++;
      return y;
    }
    hardDrop() {
      if (this.status !== 'running') return false;
      const y = this.ghostY();
      const distance = y - this.current.y;
      this.score += distance * 2;
      this.current.y = y;
      this.emit('drop', {distance, cells: this.cells()});
      this.lock();
      return true;
    }
    swapHold() {
      if (this.status !== 'running' || !this.canHold) return false;
      const type = this.current.type;
      const previous = this.hold;
      this.hold = type;
      this.spawn(previous || undefined, false);
      this.emit('hold');
      return true;
    }
    get gravity() { return Math.max(65, 900 * Math.pow(0.8, this.level - 1)); }
    tick(milliseconds, soft = false) {
      if (this.status !== 'running' || milliseconds <= 0 || !Number.isFinite(milliseconds)) return;
      // Small slices make landing/lock timing independent of rendering frequency.
      let remaining = Math.min(milliseconds, 2000);
      while (remaining > 0 && this.status === 'running') {
        const dt = Math.min(remaining, 10);
        remaining -= dt;
        const interval = soft ? Math.min(35, this.gravity / 20) : this.gravity;
        this.gravityElapsed += dt;
        while (this.gravityElapsed >= interval) {
          this.gravityElapsed -= interval;
          if (!this.fall(soft)) { this.gravityElapsed = 0; break; }
        }
        if (this.grounded()) {
          this.lockElapsed += dt;
          if (this.lockElapsed >= 500) this.lock();
        } else this.lockElapsed = 0;
      }
    }
    lock() {
      if (this.status !== 'running') return;
      const lockedCells = this.cells();
      for (const {x,y} of lockedCells) this.board[y][x] = this.current.type;
      this.emit('lock', {cells: lockedCells, piece: this.current.type});
      const full = [];
      this.board.forEach((row, i) => { if (row.every(Boolean)) full.push(i); });
      if (full.length) {
        this.board = this.board.filter((_, y) => !full.includes(y));
        while (this.board.length < ROWS) this.board.unshift(Array(WIDTH).fill(null));
        this.combo++;
        const base = [0,100,300,500,800][full.length] * this.level;
        const b2bBonus = full.length === 4 && this.backToBack ? base / 2 : 0;
        const points = base + b2bBonus + Math.max(0, this.combo) * 50 * this.level;
        this.score += points;
        this.lines += full.length;
        const previousLevel = this.level;
        this.level = Math.floor(this.lines / 10) + 1;
        this.backToBack = full.length === 4;
        this.emit('clear', {rows: full, count: full.length, points, combo: this.combo, b2bBonus});
        if (this.level > previousLevel) this.emit('level', {level: this.level});
      } else this.combo = -1;
      if (this.board.slice(0, HIDDEN).some(row => row.some(Boolean))) this.end();
      else this.spawn();
    }
    pause() {
      if (this.status === 'running') { this.status = 'paused'; this.emit('pause'); return true; }
      return false;
    }
    resume() {
      if (this.status === 'paused') { this.status = 'running'; this.emit('resume'); return true; }
      return false;
    }
    end() { this.status = 'over'; this.emit('over', {score: this.score}); }
  }
  return {Game, WIDTH, HEIGHT, HIDDEN, ROWS, TYPES, COLORS, SHAPES, rotateMatrix, emptyBoard};
});
