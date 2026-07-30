# Áp dụng Braiding Mazes vào `MazeModelV1`

Braiding nên được xem là một **bước hậu xử lý topology**:

```text
Tạo grid
→ Generate perfect maze
→ Braid maze
→ Tạo hình học đường đi
→ Render
```

Braiding không thay đổi node. Nó chỉ thêm một số edge mới tại các node đang là ngõ cụt, từ đó tạo vòng lặp.

Trong sách, quy trình là: lấy danh sách dead end, xáo trộn, kiểm tra lại từng cell, chọn theo xác suất `p`, tìm neighbor chưa được liên kết, ưu tiên neighbor cũng là dead end, rồi tạo liên kết mới. Việc kiểm tra lại là cần thiết vì một dead end có thể đã được xử lý gián tiếp khi một dead end khác nối vào nó.

---

## 1. Braiding thay đổi graph như thế nào?

Một node là dead end khi:

```ts
degree(node) === 1
```

Ví dụ ban đầu:

```text
A ─── B ─── C
            │
            D
```

Nếu `A` chỉ nối với `B`, `A` là dead end.

Giả sử `A` có một neighbor vật lý là `D`, nhưng tường giữa chúng chưa bị mở:

```text
A ─── B ─── C
┆           │
┆           D
```

Braiding thêm edge:

```text
A ─── B ─── C
│           │
└───────────D
```

Kết quả:

* `degree(A)` tăng từ `1` lên `2`.
* Dead end tại `A` biến mất.
* Graph xuất hiện một cycle.
* Có nhiều hơn một route giữa một số node.

Nếu `D` cũng là dead end trước khi nối, một edge có thể loại bỏ hai dead end cùng lúc.

---

# 2. Vấn đề quan trọng trong model hiện tại

Model hiện tại chỉ lưu:

```ts
nodes: Record<string, {
  id: string;
  position: Vec2;
}>;

edges: Record<string, {
  id: string;
  from: string;
  to: string;
  path: CatmullRomPath;
  width: number;
}>;
```

Từ `edges`, bạn chỉ biết:

> Node nào hiện đang được kết nối bằng passage.

Nhưng braiding còn cần biết:

> Node nào có thể kết nối với nhau nếu phá bức tường ở giữa.

Đó là hai loại adjacency khác nhau.

## Linked adjacency

Những passage hiện đang mở:

```ts
linkedNeighbors["A"] = ["B"];
```

## Potential adjacency

Những cell nằm cạnh nhau trong grid, bất kể giữa chúng đã có passage hay chưa:

```ts
potentialNeighbors["A"] = ["B", "D"];
```

Braiding cần cả hai:

```text
Potential neighbor
    nhưng
chưa phải linked neighbor
```

Không nên suy luận potential neighbor chỉ bằng khoảng cách giữa các `position`, vì cách đó sẽ hỏng khi bạn dùng:

* Mask.
* Triangle grid.
* Hex grid.
* Polar grid.
* Irregular grid.
* Hole.
* Graph đã được simplify.
* Các node nằm gần nhau về hình học nhưng không được phép nối.

Giải pháp ít ảnh hưởng nhất đến `MazeModelV1` là truyền thêm một `MazeTopology` vào thuật toán.

```ts
interface MazeTopology {
  /**
   * Các node có chung biên và có thể mở passage trực tiếp.
   */
  neighbors: Record<string, readonly string[]>;
}
```

Ví dụ:

```ts
const topology: MazeTopology = {
  neighbors: {
    "0,0": ["0,1", "1,0"],
    "0,1": ["0,0", "0,2", "1,1"],
    "0,2": ["0,1", "1,2"],

    "1,0": ["0,0", "1,1", "2,0"],
    "1,1": ["0,1", "1,0", "1,2", "2,1"],
    // ...
  }
};
```

Về lâu dài, phần này nên được đưa vào single source of truth:

```ts
interface MazeModelV2 extends MazeModelV1 {
  topology: {
    neighbors: Record<string, string[]>;
  };
}
```

---

# 3. Không nên braid sau khi đã simplify graph

Giả sử corridor dài được simplify thành một edge:

```text
A ─ B ─ C ─ D
```

trở thành:

```text
A ───────── D
```

Lúc này `B` và `C` không còn tồn tại trong model. Bạn sẽ không thể mở một passage mới tại `B`.

Pipeline tốt hơn là:

```text
Discrete grid graph
    ↓
Generate perfect maze
    ↓
Braiding
    ↓
Simplify corridors nếu cần
    ↓
Convert thành Catmull-Rom paths
    ↓
Render
```

Nếu mỗi grid cell vẫn được lưu thành một node trong `MazeModelV1`, bạn có thể braid trực tiếp trên model hiện tại.

---

# 4. Thuật toán cơ bản theo sách

Phiên bản sát với sách có dạng:

```ts
function braid(grid: Grid, probability = 1): void {
  const deadEnds = shuffle(grid.getDeadEnds());

  for (const cell of deadEnds) {
    // Có thể đã được node khác nối vào trước đó.
    if (!cell.isDeadEnd()) continue;

    if (Math.random() > probability) continue;

    const unlinkedNeighbors = cell.neighbors.filter(
      neighbor => !cell.isLinkedTo(neighbor)
    );

    const deadEndNeighbors = unlinkedNeighbors.filter(
      neighbor => neighbor.isDeadEnd()
    );

    const candidates =
      deadEndNeighbors.length > 0
        ? deadEndNeighbors
        : unlinkedNeighbors;

    const neighbor = randomChoice(candidates);

    if (neighbor) {
      cell.link(neighbor);
    }
  }
}
```

Sách ưu tiên nối hai dead end để một edge có thể xử lý hai dead end cùng lúc và thường cho kết quả thẩm mỹ hơn. Tuy nhiên, điều đó khiến `p = 0.5` không có nghĩa chính xác là loại bỏ 50% dead end, vì một lần nối có thể loại bỏ hai dead end. Sách cũng nêu điểm này như một hạn chế cần cải tiến.

---

# 5. Thiết kế phù hợp hơn cho hệ thống của bạn

Tôi khuyên dùng `ratio` với ý nghĩa:

```text
Tỷ lệ số dead end ban đầu cần loại bỏ
```

Thay vì xác suất độc lập trên từng dead end.

Ví dụ:

```ts
ratio = 0.4
```

Nếu có 20 dead end hợp lệ:

```text
targetRemovedDeadEnds = round(20 × 0.4) = 8
```

Thuật toán dừng khi đã loại bỏ 8 dead end hoặc không còn connection hợp lệ.

Cách này dễ kiểm soát maze hơn.

---

# 6. TypeScript implementation

## Các kiểu hỗ trợ

```ts
type NodeId = string;

type MazeNode = MazeModelV1["nodes"][string];
type MazeEdge = MazeModelV1["edges"][string];

interface MazeTopology {
  /**
   * Physical/grid adjacency.
   *
   * A và B xuất hiện tại đây nghĩa là có thể mở passage trực tiếp
   * giữa A và B nếu các rule khác cho phép.
   */
  neighbors: Record<NodeId, readonly NodeId[]>;
}

interface CreateBraidEdgeArgs {
  id: string;

  fromId: NodeId;
  toId: NodeId;

  fromNode: MazeNode;
  toNode: MazeNode;
}

interface BraidCandidateContext {
  model: MazeModelV1;

  fromId: NodeId;
  toId: NodeId;

  fromNode: MazeNode;
  toNode: MazeNode;

  /**
   * Độ dài cycle được tạo ra nếu thêm edge này.
   */
  cycleLength: number;
}

interface BraidOptions {
  /**
   * Tỷ lệ dead end cần loại bỏ, trong khoảng 0..1.
   */
  ratio: number;

  /**
   * Ưu tiên nối dead end với dead end.
   */
  preferDeadEndNeighbors?: boolean;

  /**
   * Ưu tiên mở passage đối diện với passage hiện tại
   * để corridor tiếp tục gần như đường thẳng.
   */
  preferStraight?: boolean;

  /**
   * Không tạo cycle quá nhỏ.
   */
  minCycleLength?: number;

  /**
   * Giới hạn tổng số edge mới.
   */
  maxAddedEdges?: number;

  /**
   * Không thay đổi connectivity của các node này.
   *
   * Thường dùng cho start, goal hoặc node đặc biệt.
   */
  protectedNodeIds?: ReadonlySet<NodeId>;

  /**
   * Kiểm tra bổ sung về geometry, hole, board boundary...
   */
  canConnect?: (context: BraidCandidateContext) => boolean;

  /**
   * Tạo path và edge tương ứng với hệ thống hiện tại.
   */
  createEdge: (args: CreateBraidEdgeArgs) => MazeEdge;

  /**
   * Cho phép dùng seeded RNG.
   */
  rng?: () => number;
}

interface BraidResult {
  model: MazeModelV1;

  initialDeadEndCount: number;
  eligibleDeadEndCount: number;
  targetRemovedCount: number;
  actualRemovedCount: number;
  finalDeadEndCount: number;

  addedEdgeIds: string[];
  targetReached: boolean;
}
```

---

## Hàm braiding hoàn chỉnh

```ts
export function braidMaze(
  source: MazeModelV1,
  topology: MazeTopology,
  options: BraidOptions
): BraidResult {
  if (options.ratio < 0 || options.ratio > 1) {
    throw new RangeError(
      `braid ratio must be between 0 and 1, received ${options.ratio}`
    );
  }

  const rng = options.rng ?? Math.random;
  const preferDeadEndNeighbors =
    options.preferDeadEndNeighbors ?? true;
  const preferStraight = options.preferStraight ?? true;
  const minCycleLength = options.minCycleLength ?? 0;
  const maxAddedEdges =
    options.maxAddedEdges ?? Number.POSITIVE_INFINITY;
  const protectedNodeIds =
    options.protectedNodeIds ?? new Set<NodeId>();

  /*
   * Chỉ copy phần cần mutate.
   * Nodes và board không bị braiding thay đổi.
   */
  const model: MazeModelV1 = {
    ...source,
    edges: {
      ...source.edges
    }
  };

  const linked = buildLinkedAdjacency(model);

  validateTopology(model, topology);
  validateGeneratedMaze(model, linked);

  const initialDeadEnds = getDeadEnds(model, linked);

  const eligibleDeadEnds = initialDeadEnds.filter(
    nodeId => !protectedNodeIds.has(nodeId)
  );

  const targetRemovedCount = Math.round(
    eligibleDeadEnds.length * options.ratio
  );

  const worklist = shuffle([...eligibleDeadEnds], rng);

  const addedEdgeIds: string[] = [];
  let actualRemovedCount = 0;

  for (const fromId of worklist) {
    if (actualRemovedCount >= targetRemovedCount) {
      break;
    }

    if (addedEdgeIds.length >= maxAddedEdges) {
      break;
    }

    /*
     * Luôn kiểm tra lại.
     *
     * Node này có thể đã không còn là dead end vì một node khác
     * vừa nối vào nó.
     */
    if (!isDeadEnd(linked, fromId)) {
      continue;
    }

    if (protectedNodeIds.has(fromId)) {
      continue;
    }

    const potentialNeighbors =
      topology.neighbors[fromId] ?? [];

    const candidateIds = potentialNeighbors.filter(toId => {
      if (toId === fromId) return false;

      if (!model.nodes[toId]) return false;

      if (protectedNodeIds.has(toId)) return false;

      /*
       * Đã có passage rồi.
       */
      if (linked.get(fromId)?.has(toId)) return false;

      return true;
    });

    const candidates = candidateIds
      .map(toId => {
        const pathLength = shortestPathLength(
          linked,
          fromId,
          toId
        );

        /*
         * Khi maze đã connected, path phải tồn tại.
         *
         * Edge mới + path cũ sẽ tạo thành đúng một cycle.
         */
        if (!Number.isFinite(pathLength)) {
          return null;
        }

        const cycleLength = pathLength + 1;
        const targetIsDeadEnd = isDeadEnd(linked, toId);

        /*
         * fromId chắc chắn là dead end.
         *
         * Nếu target cũng là dead end, edge này loại bỏ 2.
         * Nếu không, nó loại bỏ 1.
         */
        const removalImpact = targetIsDeadEnd ? 2 : 1;

        return {
          toId,
          cycleLength,
          targetIsDeadEnd,
          removalImpact
        };
      })
      .filter(
        (
          candidate
        ): candidate is {
          toId: string;
          cycleLength: number;
          targetIsDeadEnd: boolean;
          removalImpact: number;
        } => candidate !== null
      )
      .filter(candidate => {
        if (candidate.cycleLength < minCycleLength) {
          return false;
        }

        /*
         * Không vượt quá target cần loại bỏ.
         *
         * Ví dụ chỉ còn cần loại bỏ 1 dead end thì không chọn
         * candidate cũng là dead end, vì nó sẽ loại bỏ 2.
         */
        const remaining =
          targetRemovedCount - actualRemovedCount;

        if (candidate.removalImpact > remaining) {
          return false;
        }

        if (!options.canConnect) {
          return true;
        }

        const toNode = model.nodes[candidate.toId];

        return options.canConnect({
          model,

          fromId,
          toId: candidate.toId,

          fromNode: model.nodes[fromId],
          toNode,

          cycleLength: candidate.cycleLength
        });
      });

    if (candidates.length === 0) {
      continue;
    }

    candidates.sort((a, b) => {
      const scoreA = scoreCandidate({
        model,
        linked,
        fromId,
        toId: a.toId,
        targetIsDeadEnd: a.targetIsDeadEnd,
        preferDeadEndNeighbors,
        preferStraight,
        rng
      });

      const scoreB = scoreCandidate({
        model,
        linked,
        fromId,
        toId: b.toId,
        targetIsDeadEnd: b.targetIsDeadEnd,
        preferDeadEndNeighbors,
        preferStraight,
        rng
      });

      return scoreB - scoreA;
    });

    const selected = candidates[0];
    const toId = selected.toId;

    const edgeId = createUniqueBraidEdgeId(
      model,
      fromId,
      toId
    );

    const edge = options.createEdge({
      id: edgeId,

      fromId,
      toId,

      fromNode: model.nodes[fromId],
      toNode: model.nodes[toId]
    });

    validateCreatedEdge(edge, fromId, toId);

    model.edges[edge.id] = edge;

    linked.get(fromId)!.add(toId);
    linked.get(toId)!.add(fromId);

    actualRemovedCount += selected.removalImpact;
    addedEdgeIds.push(edge.id);
  }

  const finalDeadEndCount = getDeadEnds(
    model,
    linked
  ).length;

  return {
    model,

    initialDeadEndCount: initialDeadEnds.length,
    eligibleDeadEndCount: eligibleDeadEnds.length,
    targetRemovedCount,
    actualRemovedCount,
    finalDeadEndCount,

    addedEdgeIds,
    targetReached:
      actualRemovedCount >= targetRemovedCount
  };
}
```

---

# 7. Các hàm hỗ trợ

## Tạo linked adjacency từ `edges`

```ts
function buildLinkedAdjacency(
  model: MazeModelV1
): Map<NodeId, Set<NodeId>> {
  const linked = new Map<NodeId, Set<NodeId>>();

  for (const nodeId of Object.keys(model.nodes)) {
    linked.set(nodeId, new Set());
  }

  for (const edge of Object.values(model.edges)) {
    const fromNeighbors = linked.get(edge.from);
    const toNeighbors = linked.get(edge.to);

    if (!fromNeighbors) {
      throw new Error(
        `Edge "${edge.id}" references missing node "${edge.from}"`
      );
    }

    if (!toNeighbors) {
      throw new Error(
        `Edge "${edge.id}" references missing node "${edge.to}"`
      );
    }

    fromNeighbors.add(edge.to);
    toNeighbors.add(edge.from);
  }

  return linked;
}
```

## Tìm dead end

```ts
function isDeadEnd(
  linked: Map<NodeId, Set<NodeId>>,
  nodeId: NodeId
): boolean {
  return linked.get(nodeId)?.size === 1;
}

function getDeadEnds(
  model: MazeModelV1,
  linked: Map<NodeId, Set<NodeId>>
): NodeId[] {
  return Object.keys(model.nodes).filter(
    nodeId => isDeadEnd(linked, nodeId)
  );
}
```

## Xáo trộn có hỗ trợ seeded RNG

```ts
function shuffle<T>(
  values: T[],
  rng: () => number
): T[] {
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));

    [values[i], values[j]] = [
      values[j],
      values[i]
    ];
  }

  return values;
}
```

## Tính độ dài cycle

Khi nối `A` với `B`, graph hiện tại đã có một path từ `A` đến `B`.

```text
Cycle length =
shortest path hiện có từ A đến B
+ edge mới A-B
```

```ts
function shortestPathLength(
  linked: Map<NodeId, Set<NodeId>>,
  startId: NodeId,
  goalId: NodeId
): number {
  if (startId === goalId) {
    return 0;
  }

  const visited = new Set<NodeId>([startId]);

  const queue: Array<{
    nodeId: NodeId;
    distance: number;
  }> = [
    {
      nodeId: startId,
      distance: 0
    }
  ];

  let cursor = 0;

  while (cursor < queue.length) {
    const current = queue[cursor++];

    for (const neighborId of linked.get(
      current.nodeId
    ) ?? []) {
      if (visited.has(neighborId)) {
        continue;
      }

      const distance = current.distance + 1;

      if (neighborId === goalId) {
        return distance;
      }

      visited.add(neighborId);

      queue.push({
        nodeId: neighborId,
        distance
      });
    }
  }

  return Number.POSITIVE_INFINITY;
}
```

---

# 8. Chọn candidate tốt hơn random thuần túy

Sách chọn random neighbor và ưu tiên dead-end neighbor. Bạn có thể giữ nguyên cách này, nhưng maze của bạn có geometry và spline nên nên thêm tiêu chí “đi thẳng”.

Giả sử dead end hiện có passage đi về phía nam:

```text
    candidate
        ↑
        A
        │
        B
```

Tốt nhất là nối `A` về phía bắc. Passage mới sẽ là phần tiếp tục tự nhiên của corridor cũ.

```ts
interface ScoreCandidateArgs {
  model: MazeModelV1;
  linked: Map<NodeId, Set<NodeId>>;

  fromId: NodeId;
  toId: NodeId;

  targetIsDeadEnd: boolean;

  preferDeadEndNeighbors: boolean;
  preferStraight: boolean;

  rng: () => number;
}

function scoreCandidate(
  args: ScoreCandidateArgs
): number {
  let score = args.rng();

  if (
    args.preferDeadEndNeighbors &&
    args.targetIsDeadEnd
  ) {
    score += 100;
  }

  if (args.preferStraight) {
    score +=
      calculateStraightContinuationScore(
        args.model,
        args.linked,
        args.fromId,
        args.toId
      ) * 10;
  }

  return score;
}
```

```ts
function calculateStraightContinuationScore(
  model: MazeModelV1,
  linked: Map<NodeId, Set<NodeId>>,
  fromId: NodeId,
  candidateId: NodeId
): number {
  const existingNeighbors = [
    ...(linked.get(fromId) ?? [])
  ];

  if (existingNeighbors.length !== 1) {
    return 0;
  }

  const exitId = existingNeighbors[0];

  const origin = model.nodes[fromId].position;
  const exit = model.nodes[exitId].position;
  const candidate = model.nodes[candidateId].position;

  const exitVector = normalize({
    x: exit.x - origin.x,
    y: exit.y - origin.y
  });

  const candidateVector = normalize({
    x: candidate.x - origin.x,
    y: candidate.y - origin.y
  });

  /*
   * Nếu hai vector đối diện:
   *
   * dot = -1
   * score = 1
   *
   * Đây là passage tiếp tục thẳng qua dead end.
   */
  return -dot(exitVector, candidateVector);
}

function normalize(vector: Vec2): Vec2 {
  const length = Math.hypot(
    vector.x,
    vector.y
  );

  if (length === 0) {
    return {
      x: 0,
      y: 0
    };
  }

  return {
    x: vector.x / length,
    y: vector.y / length
  };
}

function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}
```

---

# 9. Tạo edge ID và kiểm tra edge

```ts
function createUniqueBraidEdgeId(
  model: MazeModelV1,
  fromId: NodeId,
  toId: NodeId
): string {
  const [a, b] = [fromId, toId].sort();

  const base = `braid:${a}:${b}`;

  if (!model.edges[base]) {
    return base;
  }

  let index = 2;

  while (model.edges[`${base}:${index}`]) {
    index++;
  }

  return `${base}:${index}`;
}
```

```ts
function validateCreatedEdge(
  edge: MazeEdge,
  expectedFromId: NodeId,
  expectedToId: NodeId
): void {
  const correctDirection =
    edge.from === expectedFromId &&
    edge.to === expectedToId;

  const reverseDirection =
    edge.from === expectedToId &&
    edge.to === expectedFromId;

  if (!correctDirection && !reverseDirection) {
    throw new Error(
      `Created braid edge "${edge.id}" has invalid endpoints`
    );
  }
}
```

---

# 10. Kiểm tra input maze

```ts
function validateTopology(
  model: MazeModelV1,
  topology: MazeTopology
): void {
  for (const [nodeId, neighbors] of Object.entries(
    topology.neighbors
  )) {
    if (!model.nodes[nodeId]) {
      throw new Error(
        `Topology references missing node "${nodeId}"`
      );
    }

    for (const neighborId of neighbors) {
      if (!model.nodes[neighborId]) {
        throw new Error(
          `Topology references missing neighbor "${neighborId}"`
        );
      }

      if (
        !topology.neighbors[neighborId]?.includes(
          nodeId
        )
      ) {
        throw new Error(
          `Topology must be symmetric: ` +
          `"${nodeId}" lists "${neighborId}", ` +
          `but "${neighborId}" does not list "${nodeId}"`
        );
      }
    }
  }
}
```

Braiding chỉ nên chạy sau khi maze generation đã hoàn thành.

```ts
function validateGeneratedMaze(
  model: MazeModelV1,
  linked: Map<NodeId, Set<NodeId>>
): void {
  const nodeIds = Object.keys(model.nodes);

  if (nodeIds.length === 0) {
    return;
  }

  for (const nodeId of nodeIds) {
    if ((linked.get(nodeId)?.size ?? 0) === 0) {
      throw new Error(
        `Node "${nodeId}" is isolated. ` +
        `Run maze generation before braiding.`
      );
    }
  }

  const visited = new Set<NodeId>();
  const queue = [nodeIds[0]];

  visited.add(nodeIds[0]);

  for (
    let cursor = 0;
    cursor < queue.length;
    cursor++
  ) {
    const nodeId = queue[cursor];

    for (const neighborId of linked.get(
      nodeId
    ) ?? []) {
      if (!visited.has(neighborId)) {
        visited.add(neighborId);
        queue.push(neighborId);
      }
    }
  }

  if (visited.size !== nodeIds.length) {
    throw new Error(
      `Maze graph is disconnected. ` +
      `Braiding expects a completed connected maze.`
    );
  }
}
```

---

# 11. Tạo topology cho rectangular grid

Nếu bạn đang dùng grid vuông hoặc chữ nhật, nên giữ ma trận node ID ngay từ lúc tạo node.

```ts
type NodeMatrix = Array<
  Array<NodeId | null>
>;
```

`null` đại diện cho:

* Cell bị mask.
* Hole.
* Vùng nằm ngoài board.
* Cell không hợp lệ.

```ts
function createRectTopology(
  nodeMatrix: NodeMatrix
): MazeTopology {
  const neighbors: Record<NodeId, NodeId[]> = {};

  const directions = [
    { row: -1, column: 0 },
    { row: 1, column: 0 },
    { row: 0, column: -1 },
    { row: 0, column: 1 }
  ];

  for (
    let row = 0;
    row < nodeMatrix.length;
    row++
  ) {
    for (
      let column = 0;
      column < nodeMatrix[row].length;
      column++
    ) {
      const nodeId = nodeMatrix[row][column];

      if (!nodeId) {
        continue;
      }

      const result: NodeId[] = [];

      for (const direction of directions) {
        const targetRow =
          row + direction.row;

        const targetColumn =
          column + direction.column;

        const targetId =
          nodeMatrix[targetRow]?.[targetColumn];

        if (targetId) {
          result.push(targetId);
        }
      }

      neighbors[nodeId] = result;
    }
  }

  return {
    neighbors
  };
}
```

Ví dụ:

```ts
const nodeMatrix: NodeMatrix = [
  ["0,0", "0,1", "0,2"],
  ["1,0", null,  "1,2"],
  ["2,0", "2,1", "2,2"]
];

const topology =
  createRectTopology(nodeMatrix);
```

Cell ở giữa là hole nên không passage nào được braid xuyên qua nó.

---

# 12. Tích hợp với `CatmullRomPath`

Braiding không nên tự biết cấu trúc bên trong của `CatmullRomPath`. Hãy truyền một edge factory.

```ts
const result = braidMaze(
  generatedMaze,
  topology,
  {
    ratio: 0.4,

    preferDeadEndNeighbors: true,
    preferStraight: true,

    minCycleLength: 6,

    protectedNodeIds: new Set([
      startNodeId,
      goalNodeId
    ]),

    createEdge: ({
      id,
      fromId,
      toId,
      fromNode,
      toNode
    }) => {
      return {
        id,
        from: fromId,
        to: toId,

        path: createStraightCatmullRomPath(
          fromNode.position,
          toNode.position
        ),

        width: 24
      };
    }
  }
);

const braidedMaze = result.model;
```

Ví dụ conceptual cho path factory:

```ts
function createStraightCatmullRomPath(
  from: Vec2,
  to: Vec2
): CatmullRomPath {
  /*
   * Điều chỉnh object này theo CatmullRomPath
   * thực tế trong codebase của bạn.
   */
  return createCatmullRomPath([
    from,
    to
  ]);
}
```

Nếu passage cần cong nhẹ:

```ts
function createCurvedBraidPath(
  from: Vec2,
  to: Vec2,
  bendAmount: number
): CatmullRomPath {
  const midpoint = {
    x: (from.x + to.x) / 2,
    y: (from.y + to.y) / 2
  };

  const dx = to.x - from.x;
  const dy = to.y - from.y;

  const length = Math.hypot(dx, dy) || 1;

  const normal = {
    x: -dy / length,
    y: dx / length
  };

  const controlPoint = {
    x: midpoint.x + normal.x * bendAmount,
    y: midpoint.y + normal.y * bendAmount
  };

  return createCatmullRomPath([
    from,
    controlPoint,
    to
  ]);
}
```

Với grid vuông, passage braid nên để thẳng. Spline cong có thể gây:

* Chạm wall.
* Giao với passage khác.
* Corridor không còn nằm trong cell boundary.
* Khó tính collision.

---

# 13. Bảo vệ start và goal

Model hiện tại lưu feature bằng `position`:

```ts
features: Record<string, {
  id: string;
  type: "start" | "goal" | "hole";
  position: Vec2;
  radius: number;
}>;
```

Braider hoạt động theo node ID. Vì vậy, bạn cần biết start và goal thuộc node nào.

Không nên chỉ dùng position về lâu dài. Nên mở rộng feature:

```ts
interface MazeFeatureV2 {
  id: string;
  type: "start" | "goal" | "hole";

  nodeId?: string;

  position: Vec2;
  radius: number;
}
```

Khi gọi braider:

```ts
const protectedNodeIds = new Set([
  maze.features.start.nodeId,
  maze.features.goal.nodeId
]);
```

Lý do cần bảo vệ:

```text
Trước braid:

START ─ A ─ B
```

`START` là dead end đúng chủ ý.

Nếu braid nó:

```text
START ─ A ─ B
  │         │
  └─────────┘
```

Start không còn là entrance rõ ràng nữa.

Goal cũng tương tự.

---

# 14. Kiểm soát kích thước loop

Random braiding có thể tạo cycle rất nhỏ:

```text
A ─ B
│   │
D ─ C
```

Cycle bốn cell thường dễ nhận ra và không tạo nhiều giá trị gameplay.

Một cycle lớn hơn:

```text
A ─ B ─ C ─ D
│           │
H ─ G ─ F ─ E
```

thường thú vị hơn vì người chơi phải đi xa hơn mới nhận ra hai route hợp lại.

Khi thêm edge từ `A` sang `B`:

```ts
cycleLength =
  shortestPathLength(A, B) + 1;
```

Có thể dùng:

```ts
minCycleLength: 6
```

Giá trị thực tế phụ thuộc kích thước maze:

```text
Maze nhỏ 10×10:  min 4–6
Maze vừa 20×20: min 6–10
Maze lớn:       min 8–16
```

Đây là rule thiết kế, không phải yêu cầu bắt buộc của thuật toán.

---

# 15. Tránh làm solution quá ngắn

Braiding có thể vô tình tạo shortcut lớn:

```text
START ───── route dài ───── GOAL
   │                         │
   └──── edge braid mới ─────┘
```

Shortest path có thể giảm mạnh.

Có ba chiến lược.

## Bảo vệ solution path

Không braid các node nằm trên đường giải chính:

```ts
protectedNodeIds: new Set(
  currentSolutionNodeIds
)
```

Cách này an toàn nhưng có thể hạn chế braiding quá nhiều.

## Giới hạn shortcut

Trước khi chấp nhận candidate:

1. Tạm thêm edge.
2. Tính shortest path mới từ start đến goal.
3. Reject nếu solution bị giảm quá nhiều.

Ví dụ:

```ts
newSolutionLength >=
  originalSolutionLength * 0.8
```

## Chỉ bảo vệ khu vực gần start và goal

Ví dụ không braid trong phạm vi 3 bước từ hai đầu:

```text
distanceFromStart < 3
distanceFromGoal < 3
```

Cách này thường cân bằng hơn.

Sau khi braid, Dijkstra vẫn có thể tìm đường đi đúng vì thuật toán hoạt động với graph có cycle.

---

# 16. Kiểm tra geometry bằng `canConnect`

`potentialNeighbors` cho biết hai node được phép nối về topology. Tuy nhiên, hệ thống của bạn còn có:

* Board boundary.
* Hole radius.
* Corridor width.
* Catmull-Rom path.
* Vật cản.
* Wall geometry.

Có thể bổ sung:

```ts
canConnect: ({
  model,
  fromNode,
  toNode
}) => {
  const segment = {
    from: fromNode.position,
    to: toNode.position
  };

  if (
    intersectsAnyHole(
      segment,
      model.features
    )
  ) {
    return false;
  }

  if (
    !isInsideBoard(
      segment,
      model.board
    )
  ) {
    return false;
  }

  return true;
}
```

Với rectangular grid chuẩn và topology đã xây từ cell matrix, phần lớn kiểm tra này không cần thiết. Topology đã loại bỏ các connection không hợp lệ.

---

# 17. Seeded random để tái tạo maze

Braiding dùng random nên cùng một base maze có thể tạo các braid khác nhau.

Trong development, nên dùng seeded RNG:

```ts
function mulberry32(seed: number): () => number {
  return function () {
    let value =
      seed += 0x6d2b79f5;

    value = Math.imul(
      value ^ (value >>> 15),
      value | 1
    );

    value ^= value +
      Math.imul(
        value ^ (value >>> 7),
        value | 61
      );

    return (
      (value ^ (value >>> 14)) >>> 0
    ) / 4294967296;
  };
}
```

```ts
const rng = mulberry32(12345);

const result = braidMaze(
  maze,
  topology,
  {
    ratio: 0.4,
    rng,
    createEdge
  }
);
```

Cùng:

```text
base maze
+ options
+ seed
```

sẽ cho cùng kết quả braid.

---

# 18. Các invariant nên test

## Connectivity vẫn được giữ

Braiding chỉ thêm edge nên maze không thể bị disconnected.

```ts
expect(isConnected(braidedMaze)).toBe(true);
```

## Số edge chỉ tăng

```ts
expect(
  Object.keys(result.model.edges).length
).toBe(
  Object.keys(original.edges).length +
  result.addedEdgeIds.length
);
```

## Dead end không tăng

```ts
expect(
  result.finalDeadEndCount
).toBeLessThanOrEqual(
  result.initialDeadEndCount
);
```

## Mỗi edge mới tạo một cycle

Với connected graph:

```text
cycle rank = E - V + 1
```

Mỗi edge braid mới làm cycle rank tăng đúng `1`.

```ts
expect(
  cycleRank(braidedMaze) -
  cycleRank(originalMaze)
).toBe(result.addedEdgeIds.length);
```

## Không có duplicate edge

Graph undirected nên:

```text
A → B
```

và:

```text
B → A
```

là cùng một connection.

## Edge mới phải thuộc potential topology

```ts
expect(
  topology.neighbors[edge.from]
).toContain(edge.to);
```

## Protected node không đổi degree

```ts
expect(
  degreeAfter(startId)
).toBe(degreeBefore(startId));
```

---

# 19. Cấu hình khởi đầu đề xuất

Đối với maze puzzle:

```ts
{
  ratio: 0.2,
  preferDeadEndNeighbors: false,
  preferStraight: true,
  minCycleLength: 6
}
```

Maze vẫn có nhiều dead end và chỉ thêm một số route phụ.

Đối với game exploration:

```ts
{
  ratio: 0.4,
  preferDeadEndNeighbors: true,
  preferStraight: true,
  minCycleLength: 8
}
```

Maze ít gây mắc kẹt hơn nhưng vẫn giữ cấu trúc rõ ràng.

Đối với maze gần như hoàn toàn braided:

```ts
{
  ratio: 0.8,
  preferDeadEndNeighbors: true,
  preferStraight: true,
  minCycleLength: 4
}
```

Không nên mặc định `ratio = 1`. Một số dead end có ích để:

* Đặt treasure.
* Đặt goal.
* Tạo phòng bí mật.
* Đặt trap.
* Cho người chơi cảm giác đã chọn sai đường.

---

# 20. Pipeline phù hợp nhất với hệ thống hiện tại

```ts
const topology =
  createRectTopology(nodeMatrix);

const perfectMaze =
  generatePerfectMaze(
    originalMaze,
    topology,
    algorithm
  );

const solution =
  findShortestPath(
    perfectMaze,
    startNodeId,
    goalNodeId
  );

const protectedNodeIds = new Set([
  startNodeId,
  goalNodeId
]);

const braidResult = braidMaze(
  perfectMaze,
  topology,
  {
    ratio: 0.35,

    preferDeadEndNeighbors: true,
    preferStraight: true,

    minCycleLength: 6,

    protectedNodeIds,

    rng: mulberry32(seed),

    createEdge: ({
      id,
      fromId,
      toId,
      fromNode,
      toNode
    }) => ({
      id,
      from: fromId,
      to: toId,

      path: createStraightCatmullRomPath(
        fromNode.position,
        toNode.position
      ),

      width: defaultCorridorWidth
    })
  }
);

const braidedMaze =
  braidResult.model;

renderMaze(canvas, braidedMaze);
```

Điểm kiến trúc quan trọng nhất là giữ rõ ba loại dữ liệu:

```text
Potential topology
    Các cell nào có thể nối trực tiếp

Current edges
    Passage nào đang thực sự mở

Edge geometry
    Passage được render bằng path nào
```

Braiding chỉ thay đổi `current edges`. Nó không nên tự suy luận grid adjacency từ spline, không sửa node position và không phụ thuộc vào Fabric.js renderer.
