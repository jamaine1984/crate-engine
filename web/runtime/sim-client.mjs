// ============================================================================
// CRATE ENGINE 2.0 — SIMULATION CLIENT
// Runs NPC/vehicle simulation in the browser. Mirrors koko-nav + koko-sim.
// NPCs walk sidewalks, vehicles follow lanes, all driven by nav graphs.
// See research/ENGINE_2_0_SPEC.md — Phase 4.
// ============================================================================

import { commandBus } from './command-bus.mjs';
import { isWasmReady, wasmSimInit, wasmSimTick, wasmSimSnapshots, wasmSimSetRunning, wasmSimSetSpeed } from './wasm-bridge.mjs';

// ---------------------------------------------------------------------------
// Nav Graph (mirrors koko-nav/graph.rs)
// ---------------------------------------------------------------------------

class NavGraph {
  constructor() {
    this.nodes = [];
    this.edges = [];
    this.adjacency = new Map(); // nodeId → [edgeIndex]
  }

  addNode(position, nodeType, chunkId) {
    const id = this.nodes.length;
    this.nodes.push({ id, position, nodeType, chunkId });
    return id;
  }

  addEdge(from, to, edgeType, speedFactor = 1.0) {
    const cost = this._distance(from, to);
    const idx = this.edges.length;
    this.edges.push({ from, to, cost, edgeType, speedFactor });
    if (!this.adjacency.has(from)) this.adjacency.set(from, []);
    this.adjacency.get(from).push(idx);
  }

  addEdgeBidir(a, b, edgeType, speedFactor = 1.0) {
    this.addEdge(a, b, edgeType, speedFactor);
    this.addEdge(b, a, edgeType, speedFactor);
  }

  neighbors(nodeId) {
    const indices = this.adjacency.get(nodeId) || [];
    return indices.map(i => this.edges[i]);
  }

  node(id) { return this.nodes[id]; }

  nearestNode(pos, filterType = null) {
    let best = null, bestDist = Infinity;
    for (const n of this.nodes) {
      if (filterType && n.nodeType !== filterType) continue;
      const d = distSq(pos, n.position);
      if (d < bestDist) { bestDist = d; best = n.id; }
    }
    return best;
  }

  nodesOfType(type) {
    return this.nodes.filter(n => n.nodeType === type).map(n => n.id);
  }

  /** Serialize to JSON matching Rust koko-nav Graph format (for WASM bridge). */
  toJSON() {
    return {
      nodes: this.nodes.map(n => ({
        id: n.id,
        position: n.position,
        node_type: n.nodeType,
        chunk_id: n.chunkId,
      })),
      edges: this.edges.map(e => ({
        from: e.from,
        to: e.to,
        cost: e.cost,
        edge_type: e.edgeType,
        speed_factor: e.speedFactor,
      })),
    };
  }

  _distance(a, b) {
    const na = this.nodes[a], nb = this.nodes[b];
    const dx = na.position[0] - nb.position[0];
    const dz = na.position[2] - nb.position[2];
    return Math.sqrt(dx * dx + dz * dz);
  }
}

function distSq(a, b) {
  const dx = a[0] - b[0], dz = a[2] - b[2];
  return dx * dx + dz * dz;
}

// ---------------------------------------------------------------------------
// A* Pathfinding (mirrors koko-nav/pathfind.rs)
// ---------------------------------------------------------------------------

function findPath(graph, start, goal) {
  if (start === goal) return { nodes: [start], totalCost: 0 };

  const goalPos = graph.node(goal)?.position;
  if (!goalPos) return null;

  const open = new MinHeap(); // { node, fScore }
  const gScore = new Map();
  const cameFrom = new Map();
  const closed = new Set();

  gScore.set(start, 0);
  open.push({ node: start, fScore: heuristic(graph.node(start).position, goalPos) });

  while (open.size() > 0) {
    const current = open.pop();
    if (current.node === goal) {
      const path = [goal];
      let n = goal;
      while (cameFrom.has(n)) { n = cameFrom.get(n); path.push(n); }
      path.reverse();
      return { nodes: path, totalCost: gScore.get(goal) };
    }

    if (closed.has(current.node)) continue;
    closed.add(current.node);

    for (const edge of graph.neighbors(current.node)) {
      if (closed.has(edge.to)) continue;
      const tentG = gScore.get(current.node) + edge.cost / edge.speedFactor;
      if (!gScore.has(edge.to) || tentG < gScore.get(edge.to)) {
        gScore.set(edge.to, tentG);
        cameFrom.set(edge.to, current.node);
        const toNode = graph.node(edge.to);
        if (toNode) open.push({ node: edge.to, fScore: tentG + heuristic(toNode.position, goalPos) });
      }
    }
  }
  return null;
}

function heuristic(a, b) {
  const dx = a[0] - b[0], dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dz * dz);
}

// Simple min-heap for A*
class MinHeap {
  constructor() { this.data = []; }
  size() { return this.data.length; }
  push(item) {
    this.data.push(item);
    this._bubbleUp(this.data.length - 1);
  }
  pop() {
    const top = this.data[0];
    const last = this.data.pop();
    if (this.data.length > 0) { this.data[0] = last; this._sinkDown(0); }
    return top;
  }
  _bubbleUp(i) {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.data[i].fScore >= this.data[p].fScore) break;
      [this.data[i], this.data[p]] = [this.data[p], this.data[i]];
      i = p;
    }
  }
  _sinkDown(i) {
    const n = this.data.length;
    while (true) {
      let smallest = i, l = 2 * i + 1, r = 2 * i + 2;
      if (l < n && this.data[l].fScore < this.data[smallest].fScore) smallest = l;
      if (r < n && this.data[r].fScore < this.data[smallest].fScore) smallest = r;
      if (smallest === i) break;
      [this.data[i], this.data[smallest]] = [this.data[smallest], this.data[i]];
      i = smallest;
    }
  }
}

// ---------------------------------------------------------------------------
// Nav Builder (mirrors koko-nav/builder.rs — simplified)
// ---------------------------------------------------------------------------

const SIDEWALK_OFFSET = 5.0;
const SIDEWALK_NODE_SPACING = 15.0;
const LANE_NODE_SPACING = 12.0;

/**
 * Build navigation graphs from a world manifest.
 * @param {object} manifest - WorldManifest from world-client.mjs
 * @returns {{ pedGraph: NavGraph, vehGraph: NavGraph }}
 */
export function buildNavGraphs(manifest) {
  const pedGraph = new NavGraph();
  const vehGraph = new NavGraph();
  const cs = manifest.chunk_size;

  // === PEDESTRIAN GRAPH ===
  const chunkEdgeNodes = new Map(); // "gx,gz,edge,i" → nodeId

  for (const chunk of manifest.chunks) {
    const { grid_x: gx, grid_z: gz } = chunk;
    const wx = gx * cs, wz = gz * cs;

    // Sidewalk nodes along 4 edges
    const edges = [
      { sx: wx + SIDEWALK_OFFSET, sz: wz + SIDEWALK_OFFSET, dx: 1, dz: 0, id: 0 }, // North
      { sx: wx + SIDEWALK_OFFSET, sz: wz + cs - SIDEWALK_OFFSET, dx: 1, dz: 0, id: 1 }, // South
      { sx: wx + SIDEWALK_OFFSET, sz: wz + SIDEWALK_OFFSET, dx: 0, dz: 1, id: 2 }, // West
      { sx: wx + cs - SIDEWALK_OFFSET, sz: wz + SIDEWALK_OFFSET, dx: 0, dz: 1, id: 3 }, // East
    ];

    const edgeLen = cs - 2 * SIDEWALK_OFFSET;
    const nodeCount = Math.ceil(edgeLen / SIDEWALK_NODE_SPACING) + 1;

    for (const e of edges) {
      let prev = null;
      for (let i = 0; i < nodeCount; i++) {
        const t = nodeCount > 1 ? i / (nodeCount - 1) : 0.5;
        const x = e.sx + e.dx * t * edgeLen;
        const z = e.sz + e.dz * t * edgeLen;
        const nodeId = pedGraph.addNode([x, 0, z], 'sidewalk', chunk.id);
        chunkEdgeNodes.set(`${gx},${gz},${e.id},${i}`, nodeId);
        if (prev !== null) pedGraph.addEdgeBidir(prev, nodeId, 'walk', 1.0);
        prev = nodeId;
      }
    }

    // Connect corners
    const lastIdx = Math.ceil(edgeLen / SIDEWALK_NODE_SPACING);
    const connect = (a, b) => {
      if (a !== undefined && b !== undefined && a !== b) pedGraph.addEdgeBidir(a, b, 'walk', 1.0);
    };
    connect(chunkEdgeNodes.get(`${gx},${gz},0,0`), chunkEdgeNodes.get(`${gx},${gz},2,0`));
    connect(chunkEdgeNodes.get(`${gx},${gz},0,${lastIdx}`), chunkEdgeNodes.get(`${gx},${gz},3,0`));
    connect(chunkEdgeNodes.get(`${gx},${gz},1,0`), chunkEdgeNodes.get(`${gx},${gz},2,${lastIdx}`));
    connect(chunkEdgeNodes.get(`${gx},${gz},1,${lastIdx}`), chunkEdgeNodes.get(`${gx},${gz},3,${lastIdx}`));

    // Building entrances
    for (const p of chunk.placements) {
      if (p.category === 'building') {
        const entId = pedGraph.addNode(p.position, 'building_entrance', chunk.id);
        const nearest = pedGraph.nearestNode(p.position, 'sidewalk');
        if (nearest !== null) pedGraph.addEdgeBidir(nearest, entId, 'entrance', 0.8);
      }
    }
  }

  // Cross-chunk crosswalks
  const gw = Math.max(...manifest.chunks.map(c => c.grid_x)) + 1;
  const gh = Math.max(...manifest.chunks.map(c => c.grid_z)) + 1;
  const edgeLen = cs - 2 * SIDEWALK_OFFSET;
  const lastIdx = Math.ceil(edgeLen / SIDEWALK_NODE_SPACING);
  const mid = Math.floor(lastIdx / 2);

  for (const chunk of manifest.chunks) {
    const { grid_x: gx, grid_z: gz } = chunk;

    // East neighbor
    if (gx + 1 < gw) {
      const a = chunkEdgeNodes.get(`${gx},${gz},3,${mid}`);
      const b = chunkEdgeNodes.get(`${gx + 1},${gz},2,${mid}`);
      if (a !== undefined && b !== undefined) {
        const pa = pedGraph.node(a).position, pb = pedGraph.node(b).position;
        const cw = pedGraph.addNode([(pa[0] + pb[0]) / 2, 0, (pa[2] + pb[2]) / 2], 'crosswalk', chunk.id);
        pedGraph.addEdgeBidir(a, cw, 'crosswalk', 0.6);
        pedGraph.addEdgeBidir(cw, b, 'crosswalk', 0.6);
      }
    }

    // South neighbor
    if (gz + 1 < gh) {
      const a = chunkEdgeNodes.get(`${gx},${gz},1,${mid}`);
      const b = chunkEdgeNodes.get(`${gx},${gz + 1},0,${mid}`);
      if (a !== undefined && b !== undefined) {
        const pa = pedGraph.node(a).position, pb = pedGraph.node(b).position;
        const cw = pedGraph.addNode([(pa[0] + pb[0]) / 2, 0, (pa[2] + pb[2]) / 2], 'crosswalk', chunk.id);
        pedGraph.addEdgeBidir(a, cw, 'crosswalk', 0.6);
        pedGraph.addEdgeBidir(cw, b, 'crosswalk', 0.6);
      }
    }
  }

  // === VEHICLE GRAPH ===
  // Intersection nodes
  const intNodeIds = [];
  for (const inter of manifest.intersections) {
    const id = vehGraph.addNode(inter.position, 'intersection', 'road');
    intNodeIds.push(id);
  }

  // Connect intersections along rows (E-W)
  for (let gz = 0; gz <= gh; gz++) {
    const z = gz * cs;
    const row = intNodeIds.filter(id => Math.abs(vehGraph.node(id).position[2] - z) < 1);
    row.sort((a, b) => vehGraph.node(a).position[0] - vehGraph.node(b).position[0]);

    for (let i = 0; i < row.length - 1; i++) {
      const from = row[i], to = row[i + 1];
      const p1 = vehGraph.node(from).position, p2 = vehGraph.node(to).position;
      const dist = Math.abs(p2[0] - p1[0]);
      const laneCount = Math.ceil(dist / LANE_NODE_SPACING);

      // Forward lane
      let prev = from;
      for (let j = 1; j < laneCount; j++) {
        const t = j / laneCount;
        const laneId = vehGraph.addNode([p1[0] + t * (p2[0] - p1[0]), 0, z + 2], 'road_lane', 'road');
        vehGraph.addEdge(prev, laneId, 'drive', 1.0);
        prev = laneId;
      }
      vehGraph.addEdge(prev, to, 'drive', 1.0);

      // Reverse lane
      prev = to;
      for (let j = 1; j < laneCount; j++) {
        const t = j / laneCount;
        const laneId = vehGraph.addNode([p2[0] + t * (p1[0] - p2[0]), 0, z - 2], 'road_lane', 'road');
        vehGraph.addEdge(prev, laneId, 'drive', 1.0);
        prev = laneId;
      }
      vehGraph.addEdge(prev, from, 'drive', 1.0);
    }
  }

  // Connect intersections along columns (N-S)
  for (let gx = 0; gx <= gw; gx++) {
    const x = gx * cs;
    const col = intNodeIds.filter(id => Math.abs(vehGraph.node(id).position[0] - x) < 1);
    col.sort((a, b) => vehGraph.node(a).position[2] - vehGraph.node(b).position[2]);

    for (let i = 0; i < col.length - 1; i++) {
      const from = col[i], to = col[i + 1];
      const p1 = vehGraph.node(from).position, p2 = vehGraph.node(to).position;
      const dist = Math.abs(p2[2] - p1[2]);
      const laneCount = Math.ceil(dist / LANE_NODE_SPACING);

      let prev = from;
      for (let j = 1; j < laneCount; j++) {
        const t = j / laneCount;
        const laneId = vehGraph.addNode([x + 2, 0, p1[2] + t * (p2[2] - p1[2])], 'road_lane', 'road');
        vehGraph.addEdge(prev, laneId, 'drive', 1.0);
        prev = laneId;
      }
      vehGraph.addEdge(prev, to, 'drive', 1.0);

      prev = to;
      for (let j = 1; j < laneCount; j++) {
        const t = j / laneCount;
        const laneId = vehGraph.addNode([x - 2, 0, p2[2] + t * (p1[2] - p2[2])], 'road_lane', 'road');
        vehGraph.addEdge(prev, laneId, 'drive', 1.0);
        prev = laneId;
      }
      vehGraph.addEdge(prev, from, 'drive', 1.0);
    }
  }

  return { pedGraph, vehGraph };
}

// ---------------------------------------------------------------------------
// Agent & Simulation (mirrors koko-sim)
// ---------------------------------------------------------------------------

const AGENT_STATES = { MOVING: 'moving', WAITING: 'waiting', IDLE: 'idle', STOPPED: 'stopped' };
const CROSSWALK_WAIT = 3.0;
const DEST_IDLE = 5.0;
const ARRIVAL_DIST_SQ = 4.0;

const PED_ASSETS = ['pedestrian_a', 'pedestrian_b', 'pedestrian_c'];
const VEH_ASSETS = ['kenney_cars_sedan_a', 'kenney_cars_sedan_b', 'kenney_cars_suv', 'kenney_cars_hatchback', 'kenney_cars_taxi'];

const ZONE_POP = {
  downtown: { peds: 8, vehs: 4 },
  commercial: { peds: 5, vehs: 3 },
  suburbs: { peds: 2, vehs: 2 },
  industrial: { peds: 1, vehs: 3 },
  park: { peds: 4, vehs: 0 },
};

class SimRng {
  constructor(seed) { this.state = BigInt(seed) + 0x9E3779B97F4A7C15n; }
  nextU64() {
    this.state = (this.state + 0x9E3779B97F4A7C15n) & 0xFFFFFFFFFFFFFFFFn;
    let z = this.state;
    z = ((z ^ (z >> 30n)) * 0xBF58476D1CE4E5B9n) & 0xFFFFFFFFFFFFFFFFn;
    z = ((z ^ (z >> 27n)) * 0x94D049BB133111EBn) & 0xFFFFFFFFFFFFFFFFn;
    return z ^ (z >> 31n);
  }
  rangeUsize(min, max) {
    if (min >= max) return min;
    return min + Number(this.nextU64() % BigInt(max - min + 1));
  }
  pick(arr) { return arr[this.rangeUsize(0, arr.length - 1)]; }
}

/**
 * Spawn agents for the city based on zone density.
 */
function spawnPopulation(manifest, pedGraph, vehGraph, seed) {
  const agents = [];
  const rng = new SimRng(seed);
  let nextId = 0;

  const entrances = pedGraph.nodesOfType('building_entrance');
  const intersections = vehGraph.nodesOfType('intersection');

  for (const chunk of manifest.chunks) {
    const pop = ZONE_POP[chunk.zone] || { peds: 2, vehs: 1 };

    // Chunk entrances
    const chunkEntrances = entrances.filter(id => pedGraph.node(id).chunkId === chunk.id);

    // Pedestrians
    const pedCount = Math.min(pop.peds, Math.max(chunkEntrances.length, 1));
    for (let i = 0; i < pedCount; i++) {
      const spawnNode = chunkEntrances.length > 0 ? chunkEntrances[i % chunkEntrances.length] : null;
      if (spawnNode === null) continue;

      const pos = [...pedGraph.node(spawnNode).position];
      const schedule = [spawnNode];
      const destCount = rng.rangeUsize(2, 4);
      for (let d = 0; d < destCount; d++) {
        if (entrances.length > 0) schedule.push(rng.pick(entrances));
      }

      agents.push({
        id: nextId++, type: 'pedestrian', state: AGENT_STATES.IDLE,
        position: pos, rotation: 0, speed: 1.4,
        assetId: rng.pick(PED_ASSETS),
        path: [], pathIndex: 0, schedule, scheduleIndex: 0,
        stateTimer: 0, waitDuration: rng.rangeUsize(0, 3), // stagger start
        sceneObjectId: null,
      });
    }

    // Vehicles
    for (let i = 0; i < pop.vehs; i++) {
      if (intersections.length === 0) continue;
      const spawnNode = rng.pick(intersections);
      const pos = [...vehGraph.node(spawnNode).position];

      const schedule = [spawnNode];
      const destCount = rng.rangeUsize(2, 4);
      for (let d = 0; d < destCount; d++) schedule.push(rng.pick(intersections));

      agents.push({
        id: nextId++, type: 'vehicle', state: AGENT_STATES.IDLE,
        position: pos, rotation: 0, speed: 8.0,
        assetId: rng.pick(VEH_ASSETS),
        path: [], pathIndex: 0, schedule, scheduleIndex: 0,
        stateTimer: 0, waitDuration: rng.rangeUsize(0, 5),
        sceneObjectId: null,
      });
    }
  }

  return agents;
}

// ---------------------------------------------------------------------------
// Simulation tick
// ---------------------------------------------------------------------------

function tickAgent(agent, pedGraph, vehGraph, dt) {
  const graph = agent.type === 'pedestrian' ? pedGraph : vehGraph;

  switch (agent.state) {
    case AGENT_STATES.MOVING: return tickMoving(agent, graph, dt);
    case AGENT_STATES.WAITING:
    case AGENT_STATES.STOPPED:
      agent.stateTimer += dt;
      if (agent.stateTimer >= agent.waitDuration) {
        agent.state = AGENT_STATES.MOVING;
        agent.stateTimer = 0;
        return true;
      }
      return false;
    case AGENT_STATES.IDLE:
      agent.stateTimer += dt;
      if (agent.stateTimer < agent.waitDuration) return false;
      // Pick next destination
      if (agent.schedule.length > 0) {
        agent.scheduleIndex = (agent.scheduleIndex + 1) % agent.schedule.length;
        const dest = agent.schedule[agent.scheduleIndex];
        const start = graph.nearestNode(agent.position, null);
        if (start !== null) {
          const pathResult = findPath(graph, start, dest);
          if (pathResult) {
            agent.path = pathResult.nodes;
            agent.pathIndex = 0;
            agent.state = AGENT_STATES.MOVING;
            agent.stateTimer = 0;
            return true;
          }
        }
      }
      agent.stateTimer = 0;
      return false;
    default: return false;
  }
}

function tickMoving(agent, graph, dt) {
  if (agent.pathIndex >= agent.path.length) {
    agent.state = AGENT_STATES.IDLE;
    agent.stateTimer = 0;
    agent.waitDuration = DEST_IDLE;
    return true;
  }

  const targetId = agent.path[agent.pathIndex];
  const targetNode = graph.node(targetId);
  if (!targetNode) { agent.state = AGENT_STATES.IDLE; return true; }

  const tp = targetNode.position;
  const dx = tp[0] - agent.position[0];
  const dz = tp[2] - agent.position[2];
  const dSq = dx * dx + dz * dz;

  if (dSq <= ARRIVAL_DIST_SQ) {
    agent.position = [...tp];
    agent.pathIndex++;

    if (targetNode.nodeType === 'crosswalk') {
      agent.state = AGENT_STATES.WAITING;
      agent.stateTimer = 0;
      agent.waitDuration = CROSSWALK_WAIT;
      return true;
    }
    if (targetNode.nodeType === 'intersection' && agent.type === 'vehicle') {
      agent.state = AGENT_STATES.STOPPED;
      agent.stateTimer = 0;
      agent.waitDuration = 1.5;
      return true;
    }
    if (agent.pathIndex >= agent.path.length) {
      agent.state = AGENT_STATES.IDLE;
      agent.stateTimer = 0;
      agent.waitDuration = DEST_IDLE;
    }
    return true;
  }

  const dist = Math.sqrt(dSq);
  const t = Math.min(agent.speed * dt / dist, 1.0);
  agent.position[0] += dx * t;
  agent.position[2] += dz * t;
  agent.rotation = Math.atan2(dz, dx) * (180 / Math.PI);
  return true;
}

// ---------------------------------------------------------------------------
// SimulationRunner — manages the full sim lifecycle
// ---------------------------------------------------------------------------

export class SimulationRunner {
  constructor() {
    this.agents = [];
    this.pedGraph = null;
    this.vehGraph = null;
    this.running = false;
    this.speed = 1.0;
    this.time = 0;
    this._rafId = null;
    this._lastTime = 0;
    this._execCmd = null;
    this._spawnedIds = new Set();
    this._useWasm = false; // set to true if WASM sim init succeeds
  }

  /**
   * Initialize simulation from a world manifest.
   * Builds nav graphs, spawns agents, starts the tick loop.
   * Tries WASM first; falls back to JS if unavailable.
   */
  async init(manifest, seed) {
    this._execCmd = window._parseAndExecute;
    if (!this._execCmd) {
      console.warn('[Sim] Engine not loaded');
      return;
    }

    this._useWasm = false;

    // --- Try WASM sim path ---
    if (isWasmReady()) {
      try {
        console.log('[Sim] Initializing via WASM...');
        // Build nav graphs via JS (we need them for WASM sim setup)
        const { pedGraph, vehGraph } = buildNavGraphs(manifest);
        this.pedGraph = pedGraph;
        this.vehGraph = vehGraph;

        // Prepare WASM setup input
        const chunks = manifest.chunks.map(c => ({
          id: c.id, zone: c.zone, grid_x: c.grid_x, grid_z: c.grid_z,
        }));
        const navManifest = {
          pedestrian_graph: pedGraph.toJSON(),
          vehicle_graph: vehGraph.toJSON(),
          stats: { pedestrian_nodes: pedGraph.nodes.length, pedestrian_edges: pedGraph.edges.length, vehicle_nodes: vehGraph.nodes.length, vehicle_edges: vehGraph.edges.length, building_entrances: 0, crosswalks: 0 },
        };
        const setupJson = JSON.stringify({ chunks, nav: navManifest });
        const result = wasmSimInit(setupJson, seed || 42);

        if (result) {
          this._useWasm = true;
          this.agents = result.snapshots || [];
          console.log(`[Sim] WASM initialized: ${result.agent_count} agents (${result.pedestrians} ped, ${result.vehicles} veh)`);
        }
      } catch (err) {
        console.warn('[Sim] WASM sim init failed, falling back to JS:', err.message);
        this._useWasm = false;
      }
    }

    // --- JS fallback path ---
    if (!this._useWasm) {
      console.log('[Sim] Building nav graphs (JS)...');
      const { pedGraph, vehGraph } = buildNavGraphs(manifest);
      this.pedGraph = pedGraph;
      this.vehGraph = vehGraph;

      console.log(`[Sim] Nav: ${pedGraph.nodes.length} ped nodes, ${vehGraph.nodes.length} veh nodes`);

      console.log('[Sim] Spawning population (JS)...');
      this.agents = spawnPopulation(manifest, pedGraph, vehGraph, seed || 42);
      console.log(`[Sim] Spawned ${this.agents.length} agents`);
    }

    // Spawn agent models in the scene
    for (const agent of this.agents) {
      const pos = agent.position || [0, 0, 0];
      const assetId = agent.assetId || agent.asset_id || 'pedestrian_a';
      const [x, y, z] = pos;
      try {
        await this._execCmd(`add ${assetId} at ${x} ${y} ${z}`);
      } catch (e) {
        // Silent fail — asset might not exist
      }
    }

    console.log(`[Sim] Ready (${this._useWasm ? 'WASM' : 'JS'}). Call start() to begin simulation.`);
  }

  /** Start the simulation loop. */
  start() {
    if (this.running) return;
    this.running = true;
    if (this._useWasm) wasmSimSetRunning(true);
    this._lastTime = performance.now();
    this._tick();
    console.log(`[Sim] Started (${this._useWasm ? 'WASM' : 'JS'})`);
  }

  /** Stop the simulation loop. */
  stop() {
    this.running = false;
    if (this._useWasm) wasmSimSetRunning(false);
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this._rafId = null;
    console.log('[Sim] Stopped');
  }

  /** Set simulation speed (0.1 - 10.0). */
  setSpeed(s) {
    this.speed = Math.max(0.1, Math.min(10.0, s));
    if (this._useWasm) wasmSimSetSpeed(this.speed);
  }

  /** Internal tick — called via requestAnimationFrame. */
  _tick() {
    if (!this.running) return;

    const now = performance.now();
    const rawDt = Math.min((now - this._lastTime) / 1000, 0.1); // cap at 100ms
    this._lastTime = now;

    if (this._useWasm) {
      // WASM path — tick is handled internally (speed applied in Rust)
      const dt = rawDt * this.speed;
      this.time += dt;
      wasmSimTick(dt);
    } else {
      // JS path
      const dt = rawDt * this.speed;
      this.time += dt;
      for (const agent of this.agents) {
        tickAgent(agent, this.pedGraph, this.vehGraph, dt);
      }
    }

    this._rafId = requestAnimationFrame(() => this._tick());
  }

  /** Get current agent snapshots for debugging/UI. */
  getSnapshots() {
    return this.agents.map(a => ({
      id: a.id, type: a.type, state: a.state,
      position: [...a.position], rotation: a.rotation,
      assetId: a.assetId,
    }));
  }

  /** Get simulation stats. */
  getStats() {
    const peds = this.agents.filter(a => a.type === 'pedestrian').length;
    const vehs = this.agents.filter(a => a.type === 'vehicle').length;
    const moving = this.agents.filter(a => a.state === 'moving').length;
    return { total: this.agents.length, pedestrians: peds, vehicles: vehs, moving, time: this.time };
  }
}

// ---------------------------------------------------------------------------
// Singleton + command bus integration
// ---------------------------------------------------------------------------

export const simulation = new SimulationRunner();

// Register simulation commands
export function registerSimCommands() {
  commandBus.on?.('SIM_START', async () => {
    simulation.start();
    return { ok: true, message: 'Simulation started' };
  });

  commandBus.on?.('SIM_STOP', async () => {
    simulation.stop();
    return { ok: true, message: 'Simulation stopped' };
  });

  commandBus.on?.('SIM_SPEED', async (payload) => {
    simulation.setSpeed(payload.speed || 1.0);
    return { ok: true, message: `Simulation speed: ${simulation.speed}x` };
  });

  commandBus.on?.('SIM_STATS', async () => {
    return { ok: true, message: 'Sim stats', data: simulation.getStats() };
  });
}
