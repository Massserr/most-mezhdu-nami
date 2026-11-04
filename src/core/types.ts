export type Road = 'dirt' | 'asphalt' | 'bridge';
export type Action = 'dirt' | 'asphalt' | 'bridge' | 'repair' | 'reinforce';
export interface Point {
  x: number;
  y: number;
}
export interface Tile extends Point {
  terrain: 'grass' | 'water' | 'obstacle';
  road: Road | null;
  damaged: boolean;
  bridgeSite: boolean;
  reinforced: boolean;
}
export interface Building extends Point {
  id: string;
  name: string;
  kind: 'home' | 'school' | 'clinic' | 'fire' | 'work';
  entrance: Point;
  residents?: number;
  opensDay?: number;
}
export interface Metrics {
  accessibility: number;
  averageTime: number | null;
  wellbeing: number;
  connected: number;
  total: number;
  speed: number;
}
export interface UndoEntry {
  tiles: Tile[];
  budget: number;
}
export interface GameState {
  version: 2;
  day: number;
  budget: number;
  tiles: Tile[];
  completedTasks: string[];
  failedTasks: string[];
  events: string[];
  history: UndoEntry[];
  finished: boolean;
  dayStart: Metrics;
  tutorialStep: number;
  migrationNotice?: string;
}
export interface Route {
  path: Point[];
  time: number | null;
}
export interface TaskDefinition {
  id: string;
  title: string;
  description: string;
  startDay: number;
  deadline: number;
  homeId: string;
  serviceId: string;
  hint: string;
}
export interface TaskView extends TaskDefinition {
  status: 'locked' | 'active' | 'ready' | 'completed' | 'failed';
  progress: string;
}
export interface Preview {
  valid: boolean;
  reason: string;
  cost: number;
  metrics: Metrics | null;
  tasksReady: string[];
}
export interface DayReport {
  day: number;
  before: Metrics;
  after: Metrics;
  completed: string[];
  failed: string[];
  events: string[];
  finished: boolean;
}
export interface Score {
  total: number;
  label: string;
  success: boolean;
  accessibility: number;
  speed: number;
  tasks: number;
  economy: number;
}
