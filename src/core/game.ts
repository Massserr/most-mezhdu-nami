import {BUILDINGS,createTiles,getTile,INITIAL_BUDGET,isBuilding} from './map.ts';
import {allRoutes,getRoute,getWeather} from './routing.ts';
import type {Action,DayReport,GameState,Metrics,Preview,Score,TaskView} from './types.ts';
const TASKS=[
 {id:'school-link',title:'Дорога к знаниям',description:'Соедините Северную слободу со школой. Дети должны добираться до занятий.',startDay:1,deadline:2},
 {id:'health',title:'Помощь рядом',description:'Обеспечьте связь всех шести кварталов с медицинским пунктом.',startDay:2,deadline:3},
 {id:'rain',title:'Дождливое утро',description:'В дождь все школьные маршруты должны занимать не более 48 усл. ед.',startDay:3,deadline:3},
 {id:'crossing',title:'Когда мост закрыт',description:'Верните доступ ко всем учреждениям после аварии старого моста: ремонт или новый путь.',startDay:4,deadline:5},
 {id:'fire-access',title:'Время на помощь',description:'Пожарная часть должна добираться до каждого квартала не дольше 42 усл. ед.',startDay:5,deadline:5},
 {id:'resilience',title:'Связь в любую погоду',description:'К концу недели сохраните доступность всех учреждений в дождь.',startDay:6,deadline:7},
];
export function createGame():GameState{
 const s:GameState={version:1,day:1,budget:INITIAL_BUDGET,tiles:createTiles(),completedTasks:[],failedTasks:[],events:['Добро пожаловать в Берёзовку. На третий день ожидается дождь. Старому южному мосту нужен запасной путь.'],history:[],finished:false,dayStart:{accessibility:0,averageTime:null,wellbeing:0,connected:0,total:18,speed:0}};
 s.dayStart=getMetrics(s);return s;
}
export function getMetrics(state:GameState):Metrics{
 const routes=allRoutes(state),reachable=routes.filter(r=>r.time!==null),connected=reachable.length,total=routes.length;
 const accessibility=100*connected/total,speed=routes.reduce((a,r)=>a+(r.time===null?0:Math.max(0,1-r.time/60)),0)/total;
 const due=TASKS.filter(t=>t.startDay<=state.day).length,q=state.completedTasks.length/Math.max(1,due);
 return {accessibility,averageTime:connected?reachable.reduce((a,r)=>a+r.time!,0)/connected:null,connected,total,speed,wellbeing:Math.round(.55*accessibility+30*speed+15*q)};
}
function taskReady(state:GameState,id:string):boolean{
 const routes=allRoutes(state);
 switch(id){
 case 'school-link':return getRoute(state,'home-east-north','school').time!==null;
 case 'health':return routes.filter(r=>r.serviceId==='clinic').every(r=>r.time!==null);
 case 'rain':return routes.filter(r=>r.serviceId==='school').every(r=>r.time!==null&&r.time<=48);
 case 'crossing':case 'resilience':return routes.every(r=>r.time!==null);
 case 'fire-access':return routes.filter(r=>r.serviceId==='fire').every(r=>r.time!==null&&r.time<=42);
 default:return false;
 }
}
export function getTasks(state:GameState):TaskView[]{return TASKS.map(t=>{
 const status=state.completedTasks.includes(t.id)?'completed':state.failedTasks.includes(t.id)?'failed':state.day<t.startDay?'locked':taskReady(state,t.id)?'ready':'active';
 return {...t,status,progress:status==='completed'?'Обещание выполнено':status==='failed'?'Срок пропущен — итоговая оценка снижена':status==='ready'?'Условие выполнено. Подтвердится в конце дня.':status==='locked'?`Откроется в день ${t.startDay}`:`Срок: конец дня ${t.deadline}`};
 })}
function validate(state:GameState,action:Action,x:number,y:number):{valid:boolean;reason:string;cost:number}{
 const invalid=(reason:string,cost=0)=>({valid:false,reason,cost});
 if(state.finished)return invalid('Партия завершена. Начните новую игру.');
 const tile=getTile(state,x,y);if(!tile)return invalid('За пределами карты.');
 if(!['dirt','asphalt','bridge','repair'].includes(action))return invalid('Неизвестное действие.');
 if(isBuilding(x,y))return invalid('Здесь находится здание.');
 let cost=0;
 if(action==='bridge'){
  if(!tile.bridgeSite)return invalid('Мост можно построить только на отмеченном створе реки.');
  if(tile.road)return invalid('Мост уже существует. Повреждённый мост можно отремонтировать.');
  cost=200;
 }else if(action==='repair'){
  if(!tile.road||!tile.damaged)return invalid('Здесь нет повреждённой дороги или моста.');
  cost=tile.road==='bridge'?80:15;
 }else{
  if(tile.terrain!=='grass')return invalid('Дорогу нельзя построить на воде или препятствии.');
  if(tile.damaged)return invalid('Сначала отремонтируйте участок.');
  if(tile.road&&!(action==='asphalt'&&tile.road==='dirt'))return invalid('На этой клетке уже есть дорога.');
  cost=action==='dirt'?25:45;
 }
 if(state.budget<cost)return invalid('Недостаточно бюджета.',cost);
 return {valid:true,reason:action==='repair'?'Восстановить прежнее покрытие':action==='asphalt'&&tile.road==='dirt'?'Заменить грунтовку асфальтом':'Строительство разрешено',cost};
}
function mutate(state:GameState,action:Action,x:number,y:number,cost:number){
 const tile=getTile(state,x,y)!;
 if(action==='bridge'||(action==='repair'&&tile.road==='bridge')){
  for(const xx of [11,12]){const part=getTile(state,xx,y)!;part.road='bridge';part.damaged=false}
 }else if(action==='repair')tile.damaged=false;else tile.road=action;
 state.budget-=cost;
}
export function previewAction(state:GameState,action:Action,x:number,y:number):Preview{
 const check=validate(state,action,x,y);if(!check.valid)return {...check,metrics:null};
 const copy={...state,tiles:state.tiles.map(t=>({...t}))};mutate(copy,action,x,y,check.cost);
 return {...check,metrics:getMetrics(copy)};
}
export function applyAction(state:GameState,action:Action,x:number,y:number):{ok:boolean;message:string}{
 const check=validate(state,action,x,y);if(!check.valid)return {ok:false,message:check.reason};
 state.history.push({tiles:state.tiles.map(t=>({...t})),budget:state.budget});
 mutate(state,action,x,y,check.cost);return {ok:true,message:`${check.reason}. Потрачено ${check.cost}.`};
}
export function undo(state:GameState):boolean{
 if(state.finished)return false;const last=state.history.pop();if(!last)return false;state.tiles=last.tiles;state.budget=last.budget;return true;
}
export function endDay(state:GameState):DayReport{
 if(state.finished)return {day:state.day,before:state.dayStart,after:getMetrics(state),completed:[],failed:[],events:[],finished:true};
 const completed:string[]=[],failed:string[]=[];
 for(const task of getTasks(state)){
  if(task.status==='ready'){state.completedTasks.push(task.id);completed.push(task.title)}
  else if(task.status==='active'&&task.deadline===state.day){state.failedTasks.push(task.id);failed.push(task.title)}
 }
 const report:DayReport={day:state.day,before:{...state.dayStart},after:getMetrics(state),completed,failed,events:[],finished:state.day===7};
 state.history=[];
 if(state.day===7){state.finished=true;report.events.push('Неделя завершена. Посмотрите, что изменилось для жителей.');return report}
 state.day++;
 if(state.day===3)report.events.push('Начался дождь: время проезда по грунту выросло вдвое.');
 if(state.day===4){for(const x of [11,12])getTile(state,x,13)!.damaged=true;report.events.push('Старый южный мост закрыт после обследования. Ремонт стоит 80. Можно использовать другой переход. Дождь закончился.')}
 if(state.day===5)report.events.push('Пожарная команда проверяет подъезды ко всем кварталам.');
 if(state.day===6)report.events.push('Вернулись дожди. Финальная проверка пройдёт на мокрых дорогах.');
 state.events.push(...report.events);state.dayStart=getMetrics(state);return report;
}
export function getScore(state:GameState):Score{
 const m=getMetrics(state),accessibility=.4*m.accessibility,speed=30*m.speed,tasks=25*state.completedTasks.length/TASKS.length,economy=5*state.budget/INITIAL_BUDGET;
 const total=Math.round(accessibility+speed+tasks+economy),success=total>=65&&m.connected===m.total&&state.completedTasks.length>=4;
 return {total,label:success?(total>=80?'Отличный результат':'Хороший результат'):'Требуется улучшение',success,accessibility,speed,tasks,economy};
}
export function getAdvisor(state:GameState):string{
 if(state.finished)return 'Неделя завершена. Начните новую партию и попробуйте другую стратегию.';
 const missing=allRoutes(state).find(r=>r.time===null);
 if(missing){const h=BUILDINGS.find(b=>b.id===missing.homeId)!;return `${h.name}: нет пути к социальному объекту. Проверьте разрывы у входа и мостовые переходы.`}
 const urgent=getTasks(state).filter(t=>t.status==='active').sort((a,b)=>a.deadline-b.deadline)[0];
 if(urgent)return `Приоритет: «${urgent.title}», срок — день ${urgent.deadline}. ${urgent.description}`;
 if(!getTile(state,11,8)?.road&&!getTile(state,11,3)?.road)return 'Все кварталы связаны, но зависят от старого южного моста. Новый переход даст запасной путь и сократит объезд.';
 return getWeather(state)==='rain'?'Во время дождя грунтовка замедляет маршруты. Выберите дом и проверьте, какие общие участки выгодно асфальтировать.':'Основные связи работают. Сравните маршруты и сохраните часть бюджета для ремонта.';
}
