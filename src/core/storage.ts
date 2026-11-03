import {createTiles,INITIAL_BUDGET,isBuilding} from './map.ts';
import {getMetrics} from './game.ts';
import type {GameState,Metrics,Tile} from './types.ts';
export const SAVE_KEY='most-mezhdu-nami-save-v1';
const ids=['school-link','health','rain','crossing','fire-access','resilience'];
function object(v:unknown):v is Record<string,unknown>{return !!v&&typeof v==='object'&&!Array.isArray(v)}
function money(v:unknown):v is number{return Number.isInteger(v)&&Number(v)>=0&&Number(v)<=INITIAL_BUDGET}
function strings(v:unknown):v is string[]{return Array.isArray(v)&&v.every(x=>typeof x==='string'&&x.length<2000)}
function validTiles(v:unknown):v is Tile[]{
 const base=createTiles();if(!Array.isArray(v)||v.length!==base.length)return false;
 for(let i=0;i<v.length;i++){
  const t=v[i],b=base[i];if(!object(t)||t.x!==b.x||t.y!==b.y||t.terrain!==b.terrain||t.bridgeSite!==b.bridgeSite||typeof t.damaged!=='boolean'||![null,'dirt','asphalt','bridge'].includes(t.road as null))return false;
  if(t.damaged&&!t.road)return false;
  if(t.road&&(b.terrain==='obstacle'||isBuilding(b.x,b.y)))return false;
  if(b.terrain==='water'&&t.road!==null&&(t.road!=='bridge'||!b.bridgeSite))return false;
  if(b.terrain!=='water'&&t.road==='bridge')return false;
 }
 for(const y of [3,8,13]){const a=v[y*24+11],b=v[y*24+12];if(a.road!==b.road||a.damaged!==b.damaged)return false}
 return true;
}
function validMetrics(v:unknown):v is Metrics{
 if(!object(v))return false;
 for(const k of ['accessibility','wellbeing','connected','total','speed'])if(typeof v[k]!=='number'||!Number.isFinite(v[k]))return false;
 return (v.averageTime===null||(typeof v.averageTime==='number'&&Number.isFinite(v.averageTime)&&v.averageTime>=0))&&Number(v.accessibility)>=0&&Number(v.accessibility)<=100&&Number(v.wellbeing)>=0&&Number(v.wellbeing)<=100&&Number(v.connected)>=0&&Number(v.connected)<=18&&v.total===18&&Number(v.speed)>=0&&Number(v.speed)<=1;
}
export function serialize(state:GameState):string{return JSON.stringify(state)}
export function deserialize(raw:string):GameState|null{
 try{
  if(typeof raw!=='string'||raw.length>5_000_000)return null;
  const s:unknown=JSON.parse(raw);if(!object(s)||s.version!==1||!Number.isInteger(s.day)||Number(s.day)<1||Number(s.day)>7||!money(s.budget)||!validTiles(s.tiles)||typeof s.finished!=='boolean'||(s.finished&&s.day!==7))return null;
  if(!strings(s.completedTasks)||!strings(s.failedTasks)||!strings(s.events)||s.events.length>100)return null;
  const taskIds=[...s.completedTasks,...s.failedTasks];if(taskIds.some(id=>!ids.includes(id))||new Set(taskIds).size!==taskIds.length)return null;
  if(!Array.isArray(s.history)||s.history.length>100||s.history.some(h=>!object(h)||!money(h.budget)||!validTiles(h.tiles)))return null;
  if(!validMetrics(s.dayStart))return null;
  const result=s as unknown as GameState;
  getMetrics(result);return result;
 }catch{return null}
}
