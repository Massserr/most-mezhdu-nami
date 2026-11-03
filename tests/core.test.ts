import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,getMetrics,getRoute,applyAction,previewAction,undo,endDay,getScore,getTile,serialize,deserialize} from '../src/core/index.ts';
import type {GameState} from '../src/core/index.ts';
function act(s:GameState,a:'dirt'|'asphalt'|'bridge'|'repair',x:number,y:number){assert.equal(applyAction(s,a,x,y).ok,true,`${a} ${x},${y}`)}
function finish(s:GameState){while(!s.finished)endDay(s);return getScore(s)}
test('initial graph has 15 of 18 routes and no crossing water outside bridges',()=>{
 const s=createGame();assert.equal(getMetrics(s).connected,15);assert.equal(getRoute(s,'home-east-north','school').time,null);
 for(const p of getRoute(s,'home-east','school').path)if(p.x===11||p.x===12)assert.equal(p.y,13);
});
test('preview is pure; bridge is atomic; undo restores budget and topology',()=>{
 const s=createGame(),before=serialize(s),p=previewAction(s,'bridge',11,8);assert.equal(p.valid,true);assert.equal(p.cost,200);assert.equal(serialize(s),before);
 const old=getRoute(s,'home-east','school').time!;act(s,'bridge',12,8);assert.equal(getTile(s,11,8)!.road,'bridge');assert.ok(getRoute(s,'home-east','school').time!<old);assert.ok(undo(s));assert.equal(serialize(s),before);
});
test('invalid construction never consumes budget or modifies state',()=>{
 const s=createGame();for(const [a,x,y] of [['dirt',11,6],['bridge',10,8],['asphalt',5,7],['repair',3,3],['dirt',1,4],['asphalt',-1,8],['dirt',3.5,3]] as const){const old=serialize(s);assert.equal(applyAction(s,a,x,y).ok,false);assert.equal(serialize(s),old)}
 s.budget=10;assert.equal(applyAction(s,'asphalt',17,3).ok,false);assert.equal(s.budget,10);
});
test('repair retains road class and asphalt upgrade costs 45',()=>{
 const s=createGame(),tile=getTile(s,8,5)!;tile.damaged=true;act(s,'repair',8,5);assert.equal(tile.road,'dirt');assert.equal(s.budget,885);act(s,'asphalt',8,5);assert.equal(tile.road,'asphalt');assert.equal(s.budget,840);
});
test('good central-bridge strategy completes seven days and all promises',()=>{
 const s=createGame();act(s,'asphalt',17,3);act(s,'bridge',11,8);endDay(s);endDay(s);endDay(s);
 assert.equal(s.day,4);assert.equal(getTile(s,11,13)!.damaged,true);assert.equal(s.history.length,0);assert.equal(undo(s),false);
 act(s,'repair',11,13);const score=finish(s);assert.equal(s.completedTasks.length,6);assert.equal(getMetrics(s).connected,18);assert.ok(score.success);assert.ok(score.total>=80);assert.equal(s.budget,575);
 const final=serialize(s);endDay(s);assert.equal(serialize(s),final);
});
test('alternate northern crossing is a viable strategy',()=>{
 const s=createGame();act(s,'asphalt',17,3);act(s,'bridge',11,3);endDay(s);endDay(s);endDay(s);act(s,'repair',12,13);const score=finish(s);assert.ok(score.success);assert.ok(s.completedTasks.length>=4);
});
test('inaction and wasteful spending fail',()=>{
 const idle=createGame();assert.equal(finish(idle).success,false);
 const waste=createGame();for(let y=0;y<16;y++)for(let x=0;x<24;x++)if(waste.budget>=45&&getTile(waste,x,y)?.road===null)applyAction(waste,'asphalt',x,y);
 assert.ok(waste.budget>=0);assert.equal(finish(waste).success,false);
});
test('dirt is cheaper but slower in rain; paving improves real graph cost',()=>{
 const dirt=createGame(),asphalt=createGame();act(dirt,'dirt',17,3);act(asphalt,'asphalt',17,3);assert.equal(dirt.budget-asphalt.budget,20);
 const dry=getRoute(dirt,'home-east-north','clinic').time!;endDay(dirt);endDay(dirt);endDay(asphalt);endDay(asphalt);
 assert.ok(getRoute(dirt,'home-east-north','clinic').time!>dry);assert.ok(getRoute(asphalt,'home-east-north','clinic').time!<getRoute(dirt,'home-east-north','clinic').time!);
});
test('save round trip retains undo and computed metrics; corrupt saves rejected',()=>{
 const s=createGame();act(s,'asphalt',17,3);const loaded=deserialize(serialize(s));assert.ok(loaded);assert.deepEqual(getMetrics(loaded),getMetrics(s));assert.ok(undo(loaded));assert.equal(loaded.budget,900);
 for(const raw of ['', '{}','null','{broken',JSON.stringify({...s,version:9}),JSON.stringify({...s,budget:-1}),JSON.stringify({...s,day:99}),JSON.stringify({...s,history:[{}]}),JSON.stringify({...s,completedTasks:['fake']})])assert.equal(deserialize(raw),null);
 const broken=JSON.parse(serialize(s));broken.tiles[8*24+11].road='bridge';assert.equal(deserialize(JSON.stringify(broken)),null);
});
