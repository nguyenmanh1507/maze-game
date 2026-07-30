## 1. “Implementing a Triangle Grid” thực sự đang làm gì?

Phần này không thay đổi thuật toán sinh maze. Nó thay đổi **graph đầu vào** mà thuật toán sẽ chạy trên đó.

Với square grid, một cell có thể có bốn hàng xóm:

```text
north, south, east, west
```

Với triangle grid, mỗi cell chỉ có ba cạnh, nên tối đa chỉ có ba hàng xóm. Các tam giác được xếp xen kẽ:

```text
△ ▽ △ ▽ △ ▽
▽ △ ▽ △ ▽ △
△ ▽ △ ▽ △ ▽
```

Hướng của một cell được xác định bằng parity của tọa độ:

```ts
const upright = (row + column) % 2 === 0;
```

Nếu tổng `row + column` là số chẵn, tam giác hướng lên. Nếu là số lẻ, tam giác hướng xuống. Đây chính là quy tắc mà sách dùng trong `TriangleCell#upright?`.

Điểm quan trọng là hai loại tam giác có adjacency khác nhau:

```text
Tam giác hướng lên △:
- west
- east
- south

Tam giác hướng xuống ▽:
- west
- east
- north
```

Tam giác hướng lên không có cạnh phía bắc, nên không thể có `north neighbor`. Tương tự, tam giác hướng xuống không có cạnh phía nam.

Code trong sách tương đương:

```ts
function getNeighborCoordinates(
  row: number,
  column: number,
): Array<[number, number]> {
  const upright = (row + column) % 2 === 0;

  return [
    [row, column - 1],
    [row, column + 1],
    upright
      ? [row + 1, column]
      : [row - 1, column],
  ];
}
```

Sau đó `TriangleGrid` chỉ cần tạo toàn bộ cell rồi gán adjacency theo quy tắc trên. Trong sách, `prepare_grid` tạo `TriangleCell`, còn `configure_cells` luôn gán `west` và `east`, rồi chọn `south` hoặc `north` dựa trên `upright?`.

---

## 2. Vì sao cách bố trí này tạo thành một grid hợp lệ?

Mỗi hàng vẫn có cùng số lượng phần tử, nhưng các cell liên tiếp chỉ dịch ngang nửa cạnh tam giác.

Giả sử cạnh tam giác là `s`. Chiều cao của tam giác đều là:

[
h = \frac{s\sqrt{3}}{2}
]

Vị trí tham chiếu của cell `(row, column)` có thể tính như sau:

```ts
const halfWidth = sideLength / 2;
const height = sideLength * Math.sqrt(3) / 2;
const halfHeight = height / 2;

const cx = origin.x + halfWidth + column * halfWidth;
const cy = origin.y + halfHeight + row * height;
```

Lưu ý rằng mỗi column chỉ dịch sang phải `sideLength / 2`, không phải toàn bộ `sideLength`. Đó là vì tam giác kế bên dùng chung một cạnh chéo.

Với tam giác hướng lên:

```text
        apex
          ▲
         / \
        /   \
 west ●───────● east
          base
```

Các đỉnh là:

```ts
const vertices = [
  { x: cx - halfWidth, y: cy + halfHeight },
  { x: cx,             y: cy - halfHeight },
  { x: cx + halfWidth, y: cy + halfHeight },
];
```

Với tam giác hướng xuống:

```ts
const vertices = [
  { x: cx - halfWidth, y: cy - halfHeight },
  { x: cx + halfWidth, y: cy - halfHeight },
  { x: cx,             y: cy + halfHeight },
];
```

Sách dùng điểm giữa apex và base làm điểm tham chiếu để đơn giản hóa việc render. Tuy nhiên, với model graph của bạn, nên dùng **centroid thực sự** của tam giác làm `node.position`:

```ts
function triangleCentroid(
  vertices: readonly [Vec2, Vec2, Vec2],
): Vec2 {
  return {
    x: (vertices[0].x + vertices[1].x + vertices[2].x) / 3,
    y: (vertices[0].y + vertices[1].y + vertices[2].y) / 3,
  };
}
```

Việc dùng centroid có lợi vì đường nối centroid của hai tam giác liền kề sẽ đi qua cạnh chung của chúng và khoảng cách giữa các node lân cận tương đối đồng đều.

---

# 3. Cách ánh xạ vào `MazeModelV1`

Model hiện tại của bạn là:

```ts
interface MazeModelV1 {
  schemaVersion: 1;

  board: {
    radius: number;
    wallHeight: number;
  };

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

  features: Record<string, {
    id: string;
    type: "start" | "goal" | "hole";
    position: Vec2;
    radius: number;
  }>;
}
```

Có thể ánh xạ như sau:

```text
Triangle cell
    → Maze node

Hai triangle cell dùng chung cạnh
    → Candidate adjacency

Passage được thuật toán carve
    → Maze edge

Centroid tam giác
    → Node position
```

Điều quan trọng là **candidate adjacency không phải lúc nào cũng trở thành `MazeModelV1.edges`**.

Ví dụ, grid ban đầu có thể có adjacency:

```text
A — B
A — C
B — D
C — D
```

Sau khi Recursive Backtracker chạy, passage thực tế có thể chỉ là:

```text
A — B
B — D
D — C
```

Vì vậy, nên có một model trung gian để chạy thuật toán:

```ts
interface TriangleGridTopology {
  rows: number;
  columns: number;
  sideLength: number;

  cells: Record<string, {
    id: string;
    row: number;
    column: number;
    upright: boolean;
    center: Vec2;
    vertices: [Vec2, Vec2, Vec2];
    neighborIds: string[];
  }>;
}
```

Pipeline phù hợp là:

```text
TriangleGridTopology
        ↓
Maze generation algorithm
        ↓
Danh sách carved passages
        ↓
MazeModelV1
```

Không nên đưa toàn bộ candidate adjacency vào `MazeModelV1.edges`, vì renderer của bạn nhiều khả năng hiểu `edges` là các passage đã tồn tại.

---

# 4. Tạo triangle-grid topology bằng TypeScript

```ts
interface Vec2 {
  x: number;
  y: number;
}

interface TriangleGridCell {
  id: string;
  row: number;
  column: number;
  upright: boolean;

  center: Vec2;
  vertices: [Vec2, Vec2, Vec2];

  neighborIds: string[];
}

interface TriangleGridTopology {
  rows: number;
  columns: number;
  sideLength: number;

  cells: Record<string, TriangleGridCell>;
}

interface CreateTriangleGridOptions {
  rows: number;
  columns: number;
  sideLength: number;
  origin?: Vec2;
}

function triangleCellId(row: number, column: number): string {
  return `tri:${row}:${column}`;
}

function isInsideGrid(
  row: number,
  column: number,
  rows: number,
  columns: number,
): boolean {
  return (
    row >= 0 &&
    row < rows &&
    column >= 0 &&
    column < columns
  );
}

function getTriangleCentroid(
  vertices: readonly [Vec2, Vec2, Vec2],
): Vec2 {
  return {
    x: (vertices[0].x + vertices[1].x + vertices[2].x) / 3,
    y: (vertices[0].y + vertices[1].y + vertices[2].y) / 3,
  };
}

function createTriangleGridTopology(
  options: CreateTriangleGridOptions,
): TriangleGridTopology {
  const {
    rows,
    columns,
    sideLength,
    origin = { x: 0, y: 0 },
  } = options;

  if (!Number.isInteger(rows) || rows <= 0) {
    throw new Error("rows must be a positive integer.");
  }

  if (!Number.isInteger(columns) || columns <= 0) {
    throw new Error("columns must be a positive integer.");
  }

  if (!Number.isFinite(sideLength) || sideLength <= 0) {
    throw new Error("sideLength must be greater than zero.");
  }

  const halfWidth = sideLength / 2;
  const height = sideLength * Math.sqrt(3) / 2;
  const halfHeight = height / 2;

  const cells: Record<string, TriangleGridCell> = {};

  /*
   * Pass 1: tạo cell và geometry.
   */
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const id = triangleCellId(row, column);
      const upright = (row + column) % 2 === 0;

      const cx =
        origin.x +
        halfWidth +
        column * halfWidth;

      const cy =
        origin.y +
        halfHeight +
        row * height;

      const vertices: [Vec2, Vec2, Vec2] = upright
        ? [
            {
              x: cx - halfWidth,
              y: cy + halfHeight,
            },
            {
              x: cx,
              y: cy - halfHeight,
            },
            {
              x: cx + halfWidth,
              y: cy + halfHeight,
            },
          ]
        : [
            {
              x: cx - halfWidth,
              y: cy - halfHeight,
            },
            {
              x: cx + halfWidth,
              y: cy - halfHeight,
            },
            {
              x: cx,
              y: cy + halfHeight,
            },
          ];

      cells[id] = {
        id,
        row,
        column,
        upright,
        center: getTriangleCentroid(vertices),
        vertices,
        neighborIds: [],
      };
    }
  }

  /*
   * Pass 2: cấu hình adjacency.
   */
  for (const cell of Object.values(cells)) {
    const verticalRow = cell.upright
      ? cell.row + 1
      : cell.row - 1;

    const candidates: Array<[number, number]> = [
      [cell.row, cell.column - 1],
      [cell.row, cell.column + 1],
      [verticalRow, cell.column],
    ];

    for (const [neighborRow, neighborColumn] of candidates) {
      if (
        !isInsideGrid(
          neighborRow,
          neighborColumn,
          rows,
          columns,
        )
      ) {
        continue;
      }

      cell.neighborIds.push(
        triangleCellId(neighborRow, neighborColumn),
      );
    }
  }

  return {
    rows,
    columns,
    sideLength,
    cells,
  };
}
```

Một cell bình thường sẽ có ba neighbor. Cell ở biên sẽ có một hoặc hai neighbor.

Ví dụ:

```ts
const topology = createTriangleGridTopology({
  rows: 10,
  columns: 17,
  sideLength: 80,
});
```

Sách cũng dùng grid `10 × 17` trong ví dụ delta maze vì kích thước này cho canvas gần vuông.

---

# 5. Chạy Recursive Backtracker trên topology

Recursive Backtracker không cần biết cell là hình vuông hay tam giác. Nó chỉ cần:

```text
current cell
→ danh sách neighbor
→ chọn một neighbor chưa được thăm
```

```ts
interface CarvedPassage {
  id: string;
  from: string;
  to: string;
}

function canonicalPassageId(
  from: string,
  to: string,
): string {
  return from < to
    ? `${from}~${to}`
    : `${to}~${from}`;
}

function randomArrayItem<T>(
  items: readonly T[],
  random: () => number,
): T {
  if (items.length === 0) {
    throw new Error("Cannot choose from an empty array.");
  }

  const rawIndex = Math.floor(random() * items.length);
  const index = Math.min(
    Math.max(rawIndex, 0),
    items.length - 1,
  );

  return items[index];
}

function generateWithRecursiveBacktracker(
  topology: TriangleGridTopology,
  random: () => number = Math.random,
): CarvedPassage[] {
  const cellIds = Object.keys(topology.cells);

  if (cellIds.length === 0) {
    return [];
  }

  const startId = randomArrayItem(cellIds, random);

  const visited = new Set<string>([startId]);
  const stack: string[] = [startId];
  const passages: CarvedPassage[] = [];

  while (stack.length > 0) {
    const currentId = stack[stack.length - 1];
    const current = topology.cells[currentId];

    if (!current) {
      throw new Error(`Unknown cell: ${currentId}`);
    }

    const unvisitedNeighbors =
      current.neighborIds.filter(
        (neighborId) => !visited.has(neighborId),
      );

    if (unvisitedNeighbors.length === 0) {
      stack.pop();
      continue;
    }

    const nextId = randomArrayItem(
      unvisitedNeighbors,
      random,
    );

    passages.push({
      id: canonicalPassageId(currentId, nextId),
      from: currentId,
      to: nextId,
    });

    visited.add(nextId);
    stack.push(nextId);
  }

  /*
   * Nếu không thăm được hết cell, topology đã bị chia
   * thành nhiều connected component.
   */
  if (visited.size !== cellIds.length) {
    throw new Error(
      `Triangle grid is disconnected: visited ` +
      `${visited.size}/${cellIds.length} cells.`,
    );
  }

  return passages;
}
```

Với perfect maze:

```text
Số passage = số cell - 1
```

Bạn nên kiểm tra invariant này trong unit test.

```ts
const topology = createTriangleGridTopology({
  rows: 10,
  columns: 17,
  sideLength: 80,
});

const passages =
  generateWithRecursiveBacktracker(topology);

console.assert(
  passages.length ===
    Object.keys(topology.cells).length - 1,
);
```

---

# 6. Export sang `MazeModelV1`

Vì chưa biết cấu trúc chính xác bên trong `CatmullRomPath` của bạn, nên exporter nên nhận một `pathFactory` từ bên ngoài:

```ts
type PathFactory = (
  from: Vec2,
  to: Vec2,
) => CatmullRomPath;

interface ExportTriangleMazeOptions {
  boardRadius: number;
  wallHeight: number;
  passageWidth: number;
  featureRadius?: number;
  createPath: PathFactory;
}
```

Exporter:

```ts
function findMazeDiameterEndpoints(
  topology: TriangleGridTopology,
  passages: readonly CarvedPassage[],
): [string, string] {
  const cellIds = Object.keys(topology.cells);

  if (cellIds.length === 0) {
    throw new Error("Cannot find endpoints in an empty maze.");
  }

  const adjacency: Record<string, string[]> = {};

  for (const id of cellIds) {
    adjacency[id] = [];
  }

  for (const passage of passages) {
    adjacency[passage.from].push(passage.to);
    adjacency[passage.to].push(passage.from);
  }

  function farthestFrom(root: string): string {
    const queue: string[] = [root];
    const distances = new Map<string, number>([
      [root, 0],
    ]);

    let head = 0;
    let farthest = root;

    while (head < queue.length) {
      const current = queue[head];
      head += 1;

      const currentDistance =
        distances.get(current) ?? 0;

      for (const neighbor of adjacency[current]) {
        if (distances.has(neighbor)) {
          continue;
        }

        const distance = currentDistance + 1;
        distances.set(neighbor, distance);
        queue.push(neighbor);

        const farthestDistance =
          distances.get(farthest) ?? 0;

        if (distance > farthestDistance) {
          farthest = neighbor;
        }
      }
    }

    return farthest;
  }

  const first = farthestFrom(cellIds[0]);
  const second = farthestFrom(first);

  return [first, second];
}

function exportTriangleMazeToModelV1(
  topology: TriangleGridTopology,
  passages: readonly CarvedPassage[],
  options: ExportTriangleMazeOptions,
): MazeModelV1 {
  const nodes: MazeModelV1["nodes"] = {};

  for (const cell of Object.values(topology.cells)) {
    nodes[cell.id] = {
      id: cell.id,
      position: {
        ...cell.center,
      },
    };
  }

  const edges: MazeModelV1["edges"] = {};

  for (const passage of passages) {
    const fromNode = nodes[passage.from];
    const toNode = nodes[passage.to];

    if (!fromNode || !toNode) {
      throw new Error(
        `Invalid passage: ${passage.from} -> ${passage.to}`,
      );
    }

    edges[passage.id] = {
      id: passage.id,
      from: passage.from,
      to: passage.to,
      path: options.createPath(
        fromNode.position,
        toNode.position,
      ),
      width: options.passageWidth,
    };
  }

  const [startNodeId, goalNodeId] =
    findMazeDiameterEndpoints(topology, passages);

  const featureRadius =
    options.featureRadius ??
    options.passageWidth * 0.75;

  return {
    schemaVersion: 1,

    board: {
      radius: options.boardRadius,
      wallHeight: options.wallHeight,
    },

    nodes,
    edges,

    features: {
      start: {
        id: "start",
        type: "start",
        position: {
          ...nodes[startNodeId].position,
        },
        radius: featureRadius,
      },

      goal: {
        id: "goal",
        type: "goal",
        position: {
          ...nodes[goalNodeId].position,
        },
        radius: featureRadius,
      },
    },
  };
}
```

Sử dụng:

```ts
const topology = createTriangleGridTopology({
  rows: 10,
  columns: 17,
  sideLength: 80,
  origin: {
    x: 100,
    y: 100,
  },
});

const passages =
  generateWithRecursiveBacktracker(topology);

const maze = exportTriangleMazeToModelV1(
  topology,
  passages,
  {
    boardRadius: 800,
    wallHeight: 24,
    passageWidth: 20,

    createPath: (from, to) =>
      createStraightCatmullRomPath(from, to),
  },
);
```

`createStraightCatmullRomPath` có thể dùng bốn control point thẳng hàng:

```ts
function lerp(a: Vec2, b: Vec2, t: number): Vec2 {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
}

function createStraightCatmullRomPath(
  from: Vec2,
  to: Vec2,
): CatmullRomPath {
  /*
   * Điều chỉnh field theo CatmullRomPath thực tế
   * trong codebase của bạn.
   */
  return {
    points: [
      from,
      lerp(from, to, 1 / 3),
      lerp(from, to, 2 / 3),
      to,
    ],
    closed: false,
  } as CatmullRomPath;
}
```

---

# 7. Start và goal nên chọn thế nào?

Đoạn code trên chọn hai đầu của **diameter** của maze tree. Đây thường là đường dài nhất trong perfect maze, nên phù hợp để tạo puzzle khó hơn.

Tuy nhiên, hai node này không chắc nằm ở viền ngoài.

Một triangle cell được xem là boundary cell nếu:

```ts
cell.neighborIds.length < 3
```

Nếu bạn muốn start và goal là hai cửa ở biên, nên:

1. Lấy danh sách boundary cell.
2. Chạy BFS từ từng boundary cell trên các carved passages.
3. Chọn cặp boundary có khoảng cách lớn nhất.

Với grid nhỏ và vừa, cách này đủ nhanh và cho bố cục tự nhiên hơn.

---

# 8. Renderer hiện tại sẽ hiển thị như thế nào?

Nếu renderer Fabric.js hiện tại của bạn chỉ render:

* node ở `position`;
* edge theo `CatmullRomPath`;
* passage theo `width`;

thì không cần thay đổi renderer. Triangle grid sẽ xuất hiện như một mạng passage zigzag:

```text
     ●
    / \
   ●   ●
    \ /
     ●
```

Đây là cách áp dụng đơn giản và phù hợp nhất với `MazeModelV1`.

Tuy nhiên, nó chưa tạo ra hình ảnh **delta maze đúng như sách**, tức các tam giác được bao quanh bởi wall và chỉ bỏ cạnh tại passage.

Muốn render kiểu sách, quy tắc là:

```text
Neighbor không tồn tại
→ vẽ outer wall

Neighbor tồn tại nhưng không có carved passage
→ vẽ wall chung

Neighbor tồn tại và có carved passage
→ bỏ wall chung
```

Renderer cần biết ba vertex của mỗi cell. Nhưng `MazeModelV1.nodes` hiện chỉ có:

```ts
{
  id,
  position
}
```

nên không thể tái tạo chính xác triangle polygon chỉ từ model.

---

# 9. Có nên sửa `MazeModelV1` không?

Cho MVP, tôi khuyên **chưa sửa**. Hãy coi triangle grid là scaffolding tạm thời dùng để tạo graph:

```text
Triangle topology
→ algorithm
→ MazeModelV1
→ Fabric renderer
```

Cách này giữ `MazeModelV1` đơn giản và cho phép bạn thử ngay Recursive Backtracker, Hunt-and-Kill, Wilson hoặc Aldous-Broder.

Chỉ nên tạo `MazeModelV2` khi bạn thực sự cần render wall theo hình cell. Khi đó có thể thêm:

```ts
interface TriangleCellGeometry {
  type: "triangle";
  upright: boolean;
  vertices: [Vec2, Vec2, Vec2];
}

interface MazeNodeV2 {
  id: string;
  position: Vec2;
  geometry: TriangleCellGeometry;
}
```

Hoặc tổng quát hơn:

```ts
type CellGeometry =
  | RectCellGeometry
  | TriangleCellGeometry
  | HexCellGeometry
  | PolarCellGeometry;
```

Nhờ đó renderer có thể vẽ wall của square, triangle, hex và polar maze từ cùng một single source of truth.

---

# 10. Thuật toán nào nên dùng?

Với triangle grid, nên ưu tiên những thuật toán chỉ phụ thuộc vào `neighborIds`:

```text
Recursive Backtracker
Hunt-and-Kill
Aldous-Broder
Wilson’s
Growing Tree
Prim
Kruskal
```

Không nên áp dụng nguyên bản Binary Tree hoặc Sidewinder. Binary Tree giả định có hai hướng ổn định như north và east, trong khi triangle cell chỉ có `north` ở khoảng một nửa số cell. Sách cảnh báo việc áp dụng thiếu cẩn thận có thể tạo ra những vùng không thể tiếp cận.

Với kiến trúc hiện tại của bạn, lựa chọn tốt nhất là:

```text
TriangleGridTopology
        ↓
Recursive Backtracker
        ↓
CarvedPassage[]
        ↓
MazeModelV1
        ↓
Fabric.js renderer
```

Phần `TriangleGridTopology` chịu trách nhiệm về hình học và adjacency; thuật toán chỉ chịu trách nhiệm chọn passage; còn `MazeModelV1` tiếp tục là dữ liệu đầu ra duy nhất dùng cho gameplay và render. Đây cũng là tinh thần chính của Chapter 8: thay grid nhưng tái sử dụng thuật toán maze.
