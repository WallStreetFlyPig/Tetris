'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {Game,WIDTH,HEIGHT,HIDDEN,ROWS,TYPES,COLORS,SHAPES,emptyBoard} = require('../engine.js');

function seeded(seed = 12345) {
  return () => { seed = (Math.imul(seed,1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}
function fresh() { const game = new Game(seeded()); game.start(); game.drainEvents(); return game; }
function put(game,type,x,y,rotations=0) {
  game.spawn(type);
  for (let i=0;i<rotations;i++) game.rotate();
  game.current.x=x; game.current.y=y;
  game.drainEvents();
  assert.equal(game.collides(game.current),false,'fixture must not overlap');
}
function lineSetup(game,count) {
  game.board=emptyBoard();
  for (let y=ROWS-count;y<ROWS;y++) {
    game.board[y].fill('J');
    game.board[y][4]=null;
  }
  put(game,'I',2,ROWS-4,1); // Vertical I occupies column 4.
}

test('seven distinct colored tetrominoes, each containing four cells',()=>{
  assert.equal(new Set(Object.values(COLORS)).size,7);
  assert.deepEqual(TYPES.slice().sort(),['I','J','L','O','S','T','Z']);
  for (const type of TYPES) assert.equal(SHAPES[type].flat().reduce((a,b)=>a+b,0),4);
  const game=fresh();
  assert.equal(game.board.length,HEIGHT+HIDDEN);
  assert.ok(game.board.every(row=>row.length===WIDTH));
});
test('7-bag: every consecutive bag has all seven types',()=>{
  const game=fresh();
  const sequence=[game.current.type];
  for(let i=1;i<140;i++) { game.spawn(); sequence.push(game.current.type); }
  for(let i=0;i<140;i+=7) assert.equal(new Set(sequence.slice(i,i+7)).size,7);
  assert.ok(game.next.length>=3);
});
test('wall and floor collision never lets a cell escape',()=>{
  for(const type of TYPES) {
    const game=fresh(); put(game,type,3,3);
    for(let i=0;i<20;i++) game.move(-1);
    assert.equal(Math.min(...game.cells().map(c=>c.x)),0);
    assert.equal(game.move(-1),false);
    for(let i=0;i<20;i++) game.move(1);
    assert.equal(Math.max(...game.cells().map(c=>c.x)),WIDTH-1);
    assert.equal(game.move(1),false);
    while(game.fall()) {}
    assert.equal(Math.max(...game.cells().map(c=>c.y)),ROWS-1);
    assert.equal(game.fall(),false);
  }
});
test('existing blocks prevent lateral movement and falling',()=>{
  const game=fresh();put(game,'O',4,10);
  game.board[10][3]='T';
  assert.equal(game.move(-1),false);
  game.board[12][4]='T';
  assert.equal(game.fall(),false);
  assert.equal(game.grounded(),true);
});
test('four clockwise or counterclockwise rotations return to original shape',()=>{
  for(const type of TYPES.filter(t=>t!=='O')) for(const direction of [1,-1]) {
    const game=fresh();put(game,type,3,7);
    const original=structuredClone(game.current);
    for(let i=0;i<4;i++) assert.equal(game.rotate(direction),true);
    assert.deepEqual(game.current,original);
  }
});
test('O shape remains stable and cannot repeatedly reset its lock delay',()=>{
  const game=fresh();put(game,'O',4,20);
  const original=structuredClone(game.current);
  assert.equal(game.rotate(),false);
  assert.deepEqual(game.current,original);
  assert.equal(game.lockResets,0);
});
test('JLSTZ and I wall kicks allow legal rotations next to walls',()=>{
  const game=fresh();put(game,'T',-1,8,1);
  assert.equal(game.rotate(-1),true);
  assert.ok(game.cells().every(c=>c.x>=0));
  put(game,'I',-2,8,1);
  assert.equal(game.rotate(-1),true);
  assert.ok(game.cells().every(c=>c.x>=0));
  assert.equal(game.collides(game.current),false);
});
test('T and I can rotate at the floor using vertical kicks',()=>{
  for(const type of ['T','I']) {
    const game=fresh();put(game,type,3,ROWS-2);
    assert.equal(game.grounded(),true);
    assert.equal(game.rotate(),true);
    assert.equal(game.collides(game.current),false);
    assert.ok(game.cells().every(c=>c.y<ROWS));
  }
});
test('blocked rotation is rejected without changing the piece',()=>{
  const game=fresh();put(game,'T',3,9);
  game.board=Array.from({length:ROWS},()=>Array(WIDTH).fill('L'));
  for(const {x,y} of game.cells()) game.board[y][x]=null;
  const original=structuredClone(game.current);
  assert.equal(game.rotate(),false);
  assert.deepEqual(game.current,original);
});
test('top boundary rotations preserve valid coordinates',()=>{
  for(const type of TYPES) {
    const game=fresh();put(game,type,3,0);
    for(let i=0;i<8;i++) { game.rotate(i%2 ? 1 : -1); assert.equal(game.collides(game.current),false); }
  }
});
test('hard drop matches ghost, scores two per cell, fixes exactly four cells',()=>{
  const game=fresh();put(game,'T',3,3);
  game.board[18][4]='O';
  const ghost=game.ghostY();
  const expected=game.cells({...game.current,y:ghost});
  game.hardDrop();
  assert.equal(game.score,(ghost-3)*2);
  for(const {x,y} of expected) assert.equal(game.board[y][x],'T');
  assert.equal(game.board.flat().filter(Boolean).length,5);
  assert.equal(game.status,'running');
});
test('soft drop adds one point per cell, automatic gravity adds none',()=>{
  const game=fresh();put(game,'O',4,3);
  assert.equal(game.fall(true),true);assert.equal(game.score,1);
  const y=game.current.y;
  game.tick(game.gravity);
  assert.equal(game.current.y,y+1);assert.equal(game.score,1);
  game.tick(140,true);
  assert.ok(game.current.y>=y+4);assert.ok(game.score>1);
});
test('grounded piece locks automatically after 500ms',()=>{
  const game=fresh();put(game,'O',4,ROWS-2);
  game.tick(490);assert.equal(game.board.flat().filter(Boolean).length,0);
  game.tick(10);assert.equal(game.board.flat().filter(Boolean).length,4);
});
test('grounded successful adjustments reset delay at most fifteen times',()=>{
  const game=fresh();put(game,'O',4,ROWS-2);
  for(let i=0;i<15;i++) { game.tick(100); assert.equal(game.move(i%2 ? -1 : 1),true);assert.equal(game.lockElapsed,0); }
  assert.equal(game.lockResets,15);
  game.tick(300);game.move(-1);assert.equal(game.lockElapsed,300);
  game.tick(200);assert.equal(game.board.flat().filter(Boolean).length,4);
});
test('failed wall movement does not reset lock delay',()=>{
  const game=fresh();put(game,'O',0,ROWS-2);
  game.tick(300);assert.equal(game.move(-1),false);assert.equal(game.lockElapsed,300);
  game.tick(200);assert.equal(game.board.flat().filter(Boolean).length,4);
});
for(const [count,points] of [[1,100],[2,300],[3,500],[4,800]]) {
  test(`clearing ${count} row(s) awards ${points}, collapses rows and restores board height`,()=>{
    const game=fresh();lineSetup(game,count);
    game.board[ROWS-count-1][0]='Z';
    game.lock();
    assert.equal(game.score,points);assert.equal(game.lines,count);
    assert.equal(game.board.length,ROWS);
    assert.equal(game.board[ROWS-1][0],'Z','upper row must shift down');
    assert.ok(game.board.every(row=>!row.every(Boolean)));
    assert.equal(game.board.flat().filter(Boolean).length,5-count);
  });
}
test('disjoint full rows collapse together without deleting partial rows',()=>{
  const game=fresh();game.board=emptyBoard();
  for(const y of [ROWS-1,ROWS-3]) { game.board[y].fill('S');game.board[y][4]=null; }
  game.board[ROWS-2][1]='Z';
  put(game,'I',2,ROWS-4,1);game.lock();
  assert.equal(game.lines,2);assert.equal(game.score,300);
  assert.equal(game.board[ROWS-1][1],'Z');
});
test('ten lines advance level and score uses level before the clear',()=>{
  const game=fresh();game.lines=9;lineSetup(game,1);game.lock();
  assert.equal(game.level,2);assert.equal(game.score,100);
  const oldSpeed=900;assert.ok(game.gravity<oldSpeed);
  game.combo=-1;lineSetup(game,1);game.lock();assert.equal(game.score,300);
  game.level=100;assert.ok(game.gravity>=65);
});
test('consecutive clears award combo bonus, non-clears reset combo',()=>{
  const game=fresh();lineSetup(game,1);game.lock();
  lineSetup(game,1);game.lock();assert.equal(game.score,250);assert.equal(game.combo,1);
  game.board=emptyBoard();put(game,'O',0,ROWS-2);game.lock();assert.equal(game.combo,-1);
  const before=game.score;lineSetup(game,1);game.lock();assert.equal(game.score-before,100);
});
test('back-to-back four-line clears award 50% extra; ordinary clear breaks chain',()=>{
  const game=fresh();lineSetup(game,4);game.lock();
  lineSetup(game,4);game.lock();assert.equal(game.score,2050); // 800 + 1200 + 50 combo.
  assert.equal(game.backToBack,true);
  lineSetup(game,1);game.lock();assert.equal(game.backToBack,false);
});
test('a placement without clearing preserves back-to-back but resets combo',()=>{
  const game=fresh();lineSetup(game,4);game.lock();
  game.board=emptyBoard();put(game,'O',0,ROWS-2);game.lock();
  assert.equal(game.backToBack,true);assert.equal(game.combo,-1);
  const before=game.score;lineSetup(game,4);game.lock();assert.equal(game.score-before,1200);
});
test('completed hidden rows clear before checking ceiling game over',()=>{
  const game=fresh();
  for(const y of [0,1]){game.board[y].fill('J');game.board[y][0]=null;}
  game.board[4][0]='Z';
  put(game,'I',-2,0,1);game.lock();
  assert.equal(game.lines,2);assert.equal(game.score,300);assert.equal(game.status,'running');
  assert.ok(game.board.slice(0,HIDDEN).every(row=>row.every(cell=>cell===null)));
  assert.equal(game.board.flat().filter(Boolean).length,3);
});
test('hold swaps once per falling piece and resets orientation and spawn position',()=>{
  const game=fresh();const first=game.current.type;const next=game.next[0];
  assert.equal(game.swapHold(),true);assert.equal(game.hold,first);assert.equal(game.current.type,next);
  assert.equal(game.swapHold(),false);
  game.hardDrop();assert.equal(game.canHold,true);
  game.move(1);game.rotate();
  assert.equal(game.swapHold(),true);assert.equal(game.current.type,first);
  assert.equal(game.current.rotation,0);assert.equal(game.current.y,HIDDEN);
  assert.equal(game.canHold,false);
});
test('blocked spawn triggers game over and all play actions are disabled',()=>{
  const game=fresh();game.board[HIDDEN][4]='T';game.spawn('O');
  assert.equal(game.status,'over');
  const snapshot=JSON.stringify(game.board);
  assert.equal(game.move(1),false);assert.equal(game.rotate(),false);
  assert.equal(game.hardDrop(),false);assert.equal(game.swapHold(),false);
  game.tick(2000);assert.equal(JSON.stringify(game.board),snapshot);
});
test('locking above the visible ceiling triggers game over',()=>{
  const game=fresh();put(game,'O',0,0);
  game.board[2][0]='Z';game.board[2][1]='Z';game.lock();assert.equal(game.status,'over');
});
test('hold checks collision and can trigger game over',()=>{
  const game=fresh();game.hold='O';game.board[HIDDEN][4]='J';
  assert.equal(game.swapHold(),true);assert.equal(game.status,'over');
});
test('pause freezes gravity, input, scoring and hold; resume restores play',()=>{
  const game=fresh();assert.equal(game.pause(),true);
  const snapshot=JSON.stringify({piece:game.current,score:game.score,hold:game.hold});
  game.tick(2000,true);game.move(1);game.rotate();game.hardDrop();game.swapHold();
  assert.equal(JSON.stringify({piece:game.current,score:game.score,hold:game.hold}),snapshot);
  assert.equal(game.resume(),true);assert.equal(game.move(1),true);
});
test('restart resets score, board, level, hold, timers and status',()=>{
  const game=fresh();game.hardDrop();game.swapHold();game.lines=29;game.level=3;game.pause();game.start();
  assert.equal(game.status,'running');assert.equal(game.score,0);assert.equal(game.level,1);
  assert.equal(game.lines,0);assert.equal(game.hold,null);assert.equal(game.canHold,true);
  assert.equal(game.board.flat().filter(Boolean).length,0);
  assert.equal(game.gravityElapsed,0);assert.equal(game.lockElapsed,0);
});
test('piece rotations never mutate shared shapes or other games',()=>{
  const shapes=JSON.stringify(SHAPES);const a=fresh(),b=fresh();
  const original=JSON.stringify(b.current);for(let i=0;i<13;i++)a.rotate();
  assert.equal(JSON.stringify(SHAPES),shapes);assert.equal(JSON.stringify(b.current),original);
  a.board[0][0]='Z';assert.equal(a.board[1][0],null);assert.equal(b.board[0][0],null);
});
test('invalid time deltas are ignored and very long frames remain bounded',()=>{
  const game=fresh();const original=JSON.stringify(game.current);
  for(const dt of [-1,0,Infinity,NaN])game.tick(dt);
  assert.equal(JSON.stringify(game.current),original);
  game.tick(1e12);assert.equal(game.status,'running');assert.ok(game.current.y<ROWS);
});
test('30,000 randomized actions preserve geometry, board size, score and clear invariants',()=>{
  const rng=seeded(7667);let game=new Game(rng);game.start();
  for(let i=0;i<30000;i++) {
    if(game.status==='over')game.start();
    const oldScore=game.score;
    switch(Math.floor(rng()*8)) {
      case 0:game.move(-1);break;case 1:game.move(1);break;
      case 2:game.rotate();break;case 3:game.rotate(-1);break;
      case 4:game.fall(true);break;case 5:game.hardDrop();break;
      case 6:game.swapHold();break;case 7:game.tick(rng()*500);break;
    }
    assert.equal(game.board.length,ROWS);assert.ok(game.board.every(row=>row.length===WIDTH));
    assert.ok(game.score>=oldScore);assert.equal(game.level,1+Math.floor(game.lines/10));
    assert.ok(game.board.every(row=>!row.every(Boolean)));
    if(game.status==='running') {
      assert.equal(game.cells().length,4);assert.equal(game.collides(game.current),false);
      assert.ok(game.ghostY()>=game.current.y);
      assert.equal(game.collides({...game.current,y:game.ghostY()+1}),true);
    }
    game.drainEvents();
  }
});
