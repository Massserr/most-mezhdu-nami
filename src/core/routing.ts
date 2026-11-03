import {BUILDINGS,getTile,MAP_WIDTH} from './map.ts';
import type {GameState,Route,Tile} from './types.ts';
export function getWeather(state:Pick<GameState,'day'>):'dry'|'rain'{return [3,6,7].includes(state.day)?'rain':'dry'}
function weight(t:Tile,rain:boolean){return t.road==='dirt'?(rain?4:2):1}
export function getRoute(state:GameState,homeId:string,serviceId:string):Route{
 const home=BUILDINGS.find(b=>b.id===homeId),service=BUILDINGS.find(b=>b.id===serviceId);
 if(!home||!service)return {path:[],time:null};
 const from=getTile(state,home.entrance.x,home.entrance.y),to=getTile(state,service.entrance.x,service.entrance.y);
 if(!from?.road||from.damaged||!to?.road||to.damaged)return {path:[],time:null};
 const start=from.y*MAP_WIDTH+from.x,end=to.y*MAP_WIDTH+to.x,dist=new Float64Array(state.tiles.length).fill(Infinity),prev=new Int32Array(state.tiles.length).fill(-1),visited=new Set<number>();
 dist[start]=0;
 while(true){
  let u=-1,best=Infinity;for(let i=0;i<dist.length;i++)if(!visited.has(i)&&dist[i]<best){u=i;best=dist[i]}
  if(u<0)break;if(u===end)break;visited.add(u);
  const tile=state.tiles[u];
  for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){
   const next=getTile(state,tile.x+dx,tile.y+dy);if(!next?.road||next.damaged)continue;
   const v=next.y*MAP_WIDTH+next.x,cost=(weight(tile,getWeather(state)==='rain')+weight(next,getWeather(state)==='rain'))/2;
   if(dist[u]+cost<dist[v]){dist[v]=dist[u]+cost;prev[v]=u}
  }
 }
 if(!Number.isFinite(dist[end]))return {path:[],time:null};
 const path=[];for(let u=end;u!==-1;u=prev[u]){path.push({x:state.tiles[u].x,y:state.tiles[u].y});if(u===start)break}
 return {path:path.reverse(),time:dist[end]};
}
export function allRoutes(state:GameState){return BUILDINGS.filter(b=>b.kind==='home').flatMap(h=>BUILDINGS.filter(b=>b.kind!=='home').map(s=>({homeId:h.id,serviceId:s.id,...getRoute(state,h.id,s.id)})))}
