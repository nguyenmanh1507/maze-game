# Tóm tắt Chapter 8 — _Exploring Other Grids_

Chapter 8 mở rộng ý tưởng từ lưới vuông và lưới tròn sang hai kiểu tessellation mới:

- **Lưới lục giác** → tạo _sigma maze_.
- **Lưới tam giác** → tạo _delta maze_.

Mục tiêu của chương không phải giới thiệu thuật toán sinh maze mới, mà chứng minh rằng các thuật toán hiện có có thể tái sử dụng trên nhiều loại hình học khác nhau, miễn là grid cung cấp đúng quan hệ hàng xóm và renderer phù hợp.

---

## 1. Tessellation là nền tảng của grid

_Tessellation_ là việc lát kín một mặt phẳng bằng các hình:

- Không có khoảng trống.
- Không có phần chồng lên nhau.

Grid vuông thông thường chỉ là một tessellation bằng hình vuông. Ngoài hình vuông, tam giác đều và lục giác đều cũng có thể lát kín mặt phẳng.

Điều này dẫn tới một cách hiểu tổng quát hơn:

```text
Grid = tập hợp cell + quan hệ neighbor
```

Hình dạng cell có thể thay đổi, nhưng maze algorithm vẫn chỉ cần biết:

```text
cell.neighbors
cell.link(other)
cell.linked?(other)
```

---

# Phần I — Hexagonal Grid

## 2. Một hex cell có sáu neighbor

Cell vuông thường có bốn neighbor:

```text
north, south, east, west
```

Cell lục giác có sáu neighbor:

```text
northwest   northeast
west        east
southwest   southeast
```

Trong sách, `HexCell` mở rộng `Cell` và thêm bốn hướng chéo:

```ruby
attr_accessor :northwest, :northeast
attr_accessor :southwest, :southeast
```

Phương thức `neighbors` trả về tối đa sáu cell hợp lệ.

Đây là thay đổi topology quan trọng nhất: maze algorithm không cần biết hình dạng là lục giác, nó chỉ thấy rằng mỗi node có thể có tối đa sáu neighbor.

---

## 3. Cách sắp xếp hex grid

Các cột lục giác không thẳng hàng hoàn toàn. Chúng được bố trí so le:

```text
column chẵn → vị trí chuẩn
column lẻ   → dịch xuống nửa cell
```

Hoặc có thể dùng quy ước ngược lại. Sách chọn một quy ước nhất quán để vẫn biểu diễn grid bằng:

```ruby
grid[row][column]
```

Vấn đề nằm ở việc tìm neighbor theo parity của `column`.

Ví dụ, với một column chẵn:

```text
northwest = [row - 1, column - 1]
southwest = [row,     column - 1]

northeast = [row - 1, column + 1]
southeast = [row,     column + 1]
```

Với column lẻ, row offset đổi lại:

```text
northwest = [row,     column - 1]
southwest = [row + 1, column - 1]

northeast = [row,     column + 1]
southeast = [row + 1, column + 1]
```

Có thể gom logic này thành:

```ruby
north_diagonal = column.even? ? row - 1 : row
south_diagonal = column.even? ? row : row + 1
```

Sau đó dùng hai giá trị này để thiết lập bốn neighbor chéo.

---

## 4. `HexGrid`

`HexGrid` kế thừa `Grid` và chủ yếu override hai phần:

### `prepare_grid`

Thay vì tạo `Cell`, grid tạo `HexCell`:

```ruby
HexCell.new(row, column)
```

### `configure_cells`

Thiết lập:

- `north`
- `south`
- `northwest`
- `northeast`
- `southwest`
- `southeast`

Điểm đáng chú ý là `east` và `west` theo nghĩa của grid vuông không còn là lựa chọn tự nhiên trong cách bố trí hexagon của sách. Hướng trái và phải được chia thành các neighbor chéo trên/dưới.

---

# 5. Hình học của hexagon

Sách sử dụng **regular hexagon**, tức sáu cạnh có cùng độ dài `s`.

Hexagon được phân tích thành các tam giác đều. Từ đó:

[
a = \frac{s}{2}
]

[
b = \frac{s\sqrt{3}}{2}
]

Kích thước toàn bộ hexagon:

[
width = 2s
]

[
height = 2b = s\sqrt{3}
]

Nếu tâm cell là `(cx, cy)`, các mốc tọa độ là:

```text
xFarWest  = cx - s
xNearWest = cx - a
xNearEast = cx + a
xFarEast  = cx + s

yNorth = cy - b
yMid   = cy
ySouth = cy + b
```

Từ các mốc này có thể suy ra sáu đỉnh của hexagon.

---

## 6. Tính vị trí tâm từng hex cell

Do các cột chồng lên nhau một phần, khoảng cách ngang giữa tâm hai cell kế tiếp không phải toàn bộ chiều rộng `2s`, mà là:

[
3a = \frac{3s}{2}
]

Tọa độ tâm theo cột:

[
cx = s + 3a \times column
]

Tọa độ dọc:

[
cy = b + 2b \times row
]

Với các cột bị so le, cộng thêm:

[
cy += b
]

cho một nhóm cột, thường là column lẻ.

Như vậy:

```text
column chẵn → cy bình thường
column lẻ   → cy + b
```

---

## 7. Kích thước canvas hex grid

Canvas phải tính thêm phần nhô ra của hexagon cuối cùng.

Chiều rộng:

[
canvasWidth = 3 \times columns \times a + a
]

Tương đương:

[
canvasWidth = \frac{3s}{2} \times columns + \frac{s}{2}
]

Chiều cao dựa trên số hàng và độ so le giữa các cột:

[
canvasHeight = 2b \times rows + b
]

Phần `+ b` dành cho những column bị dịch xuống nửa chiều cao.

---

## 8. Render wall của hex cell

Không nên vẽ cả sáu cạnh cho mọi cell vì các cạnh chung sẽ bị vẽ hai lần.

Một cách tối ưu là để mỗi cell chịu trách nhiệm cho một số cạnh nhất định:

- Cạnh northwest hoặc southwest khi không có neighbor bên ngoài.
- Cạnh northeast nếu không liên kết với `northeast`.
- Cạnh southeast nếu không liên kết với `southeast`.
- Cạnh north hoặc south tương ứng nếu passage không được mở.

Logic tổng quát:

```text
Không có neighbor ngoài grid
    → luôn vẽ biên ngoài

Có neighbor nhưng không linked
    → vẽ wall

Có neighbor và linked
    → bỏ wall để tạo passage
```

Renderer phải coi từng cạnh như đoạn thẳng nối hai đỉnh của hexagon.

---

## 9. Sigma maze

Maze trên lưới lục giác đôi khi được gọi là **sigma maze**. Tên gọi không ảnh hưởng tới cấu trúc hay thuật toán.

Sách sử dụng:

```ruby
grid = HexGrid.new(rows, columns)
RecursiveBacktracker.on(grid)
grid.to_png.save("hex.png")
```

Recursive Backtracker hoạt động tốt vì nó chỉ dùng `neighbors`.

Kết quả khác grid vuông ở chỗ:

- Mỗi cell có nhiều lựa chọn rẽ hơn.
- Maze có nhiều hướng chéo.
- Passage mang cảm giác tự nhiên và ít “vuông vức”.
- Các junction có thể nối nhiều nhánh hơn.

---

## 10. Cảnh báo với Binary Tree và Sidewinder

Binary Tree và Sidewinder được thiết kế dựa trên các hướng cụ thể của grid vuông.

Ví dụ Binary Tree giả định mỗi cell lựa chọn giữa:

```text
north hoặc east
```

Trên hex grid, không có ánh xạ duy nhất và tự nhiên cho hai hướng đó. Có thể sửa thuật toán để dùng một cặp hướng hexagon, nhưng:

- Bias sẽ thay đổi.
- Edge case phức tạp hơn.
- Có nguy cơ tạo vùng không liên thông nếu chọn hướng sai.

Vì vậy, các thuật toán dựa trên danh sách neighbor tổng quát như Recursive Backtracker, Hunt-and-Kill, Wilson’s hoặc Aldous-Broder phù hợp hơn.

---

# Phần II — Triangle Grid

## 11. Cấu trúc của lưới tam giác

Sách dùng **equilateral triangles** — tam giác đều.

Các triangle cell luân phiên:

```text
▲ ▼ ▲ ▼ ▲ ▼
▼ ▲ ▼ ▲ ▼ ▲
▲ ▼ ▲ ▼ ▲ ▼
```

Một cell hướng lên hay hướng xuống phụ thuộc vào tổng `row + column`:

```ruby
upright = (row + column).even?
```

Nếu tổng chẵn:

```text
cell hướng lên ▲
```

Nếu tổng lẻ:

```text
cell hướng xuống ▼
```

Mỗi hàng cũng bắt đầu bằng hướng ngược với hàng trước.

---

## 12. Neighbor của triangle cell

Mỗi tam giác chỉ có ba cạnh, nên tối đa có ba neighbor.

Cả hai loại đều có:

```text
west
east
```

Neighbor thứ ba phụ thuộc orientation:

### Tam giác hướng lên `▲`

Có cạnh đáy ở phía dưới:

```text
west
east
south
```

Không có `north`.

### Tam giác hướng xuống `▼`

Có cạnh đáy ở phía trên:

```text
west
east
north
```

Không có `south`.

Code tương ứng:

```ruby
def neighbors
  list = []

  list << west if west
  list << east if east

  if upright?
    list << south if south
  else
    list << north if north
  end

  list
end
```

Đây là một topology khá khác so với hex grid:

```text
Square cell   → tối đa 4 neighbors
Hex cell      → tối đa 6 neighbors
Triangle cell → tối đa 3 neighbors
```

---

## 13. `TriangleGrid`

`TriangleGrid` vẫn dùng cấu trúc mảng hai chiều quen thuộc.

`prepare_grid` tạo:

```ruby
TriangleCell.new(row, column)
```

`configure_cells` luôn gán:

```ruby
cell.west = self[row, column - 1]
cell.east = self[row, column + 1]
```

Sau đó dựa vào orientation:

```ruby
if cell.upright?
  cell.south = self[row + 1, column]
else
  cell.north = self[row - 1, column]
end
```

Như vậy mỗi cell chỉ nhận đúng neighbor tương ứng với ba cạnh thực tế của nó.

---

# 14. Hình học của tam giác đều

Gọi độ dài cạnh là `s`.

Chiều rộng:

[
width = s
]

Chiều cao:

[
height = \frac{s\sqrt{3}}{2}
]

Các giá trị nửa kích thước:

[
halfWidth = \frac{s}{2}
]

[
halfHeight = \frac{height}{2}
]

Nếu tâm là `(cx, cy)`:

```text
westX = cx - halfWidth
midX  = cx
eastX = cx + halfWidth
```

Đối với tam giác hướng lên:

```text
baseY = cy + halfHeight
apexY = cy - halfHeight
```

Đối với tam giác hướng xuống:

```text
baseY = cy - halfHeight
apexY = cy + halfHeight
```

Tức là tọa độ X giữ nguyên; chỉ vị trí apex và base đổi chỗ theo orientation.

---

## 15. Vị trí triangle cell trên canvas

Các tam giác kế nhau chia sẻ cạnh chéo, nên tâm của chúng chỉ cách nhau nửa chiều rộng.

Tọa độ tâm theo cột thường có dạng:

[
cx = halfWidth + column \times halfWidth
]

Tọa độ theo hàng:

[
cy = halfHeight + row \times height
]

Do triangle hướng lên và hướng xuống luân phiên, các đỉnh sẽ tự đan xen đúng cách mà không cần offset cột giống hex grid.

Canvas có thể tính gần đúng:

[
canvasWidth = halfWidth \times (columns + 1)
]

[
canvasHeight = height \times rows
]

---

## 16. Render triangle wall

Mỗi triangle cell có ba cạnh:

### Tam giác hướng lên

- Cạnh trái: west → apex
- Cạnh phải: apex → east
- Cạnh đáy: west → east

### Tam giác hướng xuống

- Cạnh trái: west → apex phía dưới
- Cạnh phải: apex → east
- Cạnh đáy nằm phía trên

Renderer áp dụng cùng quy tắc:

```text
không có neighbor → vẽ outer boundary
có neighbor nhưng không linked → vẽ wall
có linked neighbor → bỏ wall
```

Cạnh ngang tương ứng với:

- `south` đối với tam giác hướng lên.
- `north` đối với tam giác hướng xuống.

Hai cạnh nghiêng tương ứng với `west` và `east`.

---

## 17. Delta maze

Maze trên triangle grid được gọi là **delta maze**, vì chữ cái Hy Lạp delta `Δ` có hình tam giác.

Cách tạo vẫn không đổi:

```ruby
grid = TriangleGrid.new(10, 17)
RecursiveBacktracker.on(grid)
grid.to_png.save("delta.png")
```

Số hàng và cột trong ví dụ được chọn theo thực nghiệm để ảnh đầu ra gần hình vuông.

Triangle maze có texture khá khác:

- Cell chỉ có tối đa ba neighbor.
- Ít lựa chọn rẽ hơn hex grid.
- Passage thường zigzag.
- Các đường đi mang cảm giác dạng giàn hoặc lưới kết cấu.
- Junction ít nhánh hơn.

---

## 18. Binary Tree gặp vấn đề nghiêm trọng trên triangle grid

Binary Tree muốn mỗi cell chọn giữa hai hướng vuông góc, chẳng hạn `north` hoặc `east`.

Nhưng trong triangle grid:

- Chỉ tam giác hướng xuống mới có `north`.
- Chỉ tam giác hướng lên mới có `south`.
- Khoảng 50% số cell không có north.

Nếu áp dụng Binary Tree trực tiếp, nhiều cell chỉ còn một lựa chọn hoặc không thể kết nối đúng với phần còn lại. Kết quả có thể xuất hiện những vùng không thể đi tới.

Sách đặc biệt cảnh báo phải rất cẩn thận khi dùng Binary Tree và Sidewinder với loại grid này.

---

# 19. So sánh ba loại grid

| Grid     | Số neighbor tối đa | Đặc điểm passage          |
| -------- | -----------------: | ------------------------- |
| Square   |                  4 | Ngang/dọc, rõ ràng        |
| Hexagon  |                  6 | Nhiều hướng rẽ, linh hoạt |
| Triangle |                  3 | Zigzag, ít nhánh hơn      |

Điều này ảnh hưởng trực tiếp tới maze texture:

### Hex grid

Có nhiều edge tiềm năng hơn:

- Nhiều junction.
- Nhiều lựa chọn chuyển hướng.
- Có thể tạo đường đi trông mềm mại hơn dù vẫn dùng đoạn thẳng.

### Triangle grid

Có ít edge tiềm năng hơn:

- Nhiều corridor ngoằn ngoèo.
- Ít intersection lớn.
- Hướng đi thay đổi liên tục theo orientation.

Tuy nhiên, nếu tạo **perfect maze**, cả hai vẫn là cây:

```text
V cells → V - 1 carved passages
```

---

# 20. Các bài tập “Your Turn”

Chương gợi ý nhiều hướng mở rộng.

## Tô màu maze không vuông

Có thể tái sử dụng `background_color_for(cell)` và Dijkstra để:

- Tô theo khoảng cách.
- Hiển thị texture.
- Đánh dấu solution.
- So sánh thuật toán trên hex và triangle grid.

Renderer phải fill polygon của cell thay vì fill rectangle.

## Masking

Kết hợp với Chapter 6:

- Mask hex cell.
- Mask triangle cell.
- Tạo chữ hoặc hình bằng tessellation không vuông.

Mask vẫn chỉ quyết định cell nào tồn tại; topology phải bỏ các neighbor trỏ vào cell bị mask.

## Tạo grid có hình dáng đúng với cell

Ví dụ:

- Hex grid có outline là hình lục giác.
- Triangle grid có outline là tam giác lớn.

Điều này khác với việc chỉ đặt các cell vào canvas hình chữ nhật.

## Tam giác không đều

Sách dùng tam giác đều để đơn giản hóa toán học. Có thể thử:

- Tam giác cân.
- Tam giác vuông.
- Tam giác có kích thước biến thiên.

Nhưng lúc đó phải tính lại:

- Vertex.
- Tâm cell.
- Canvas bounds.
- Quan hệ giữa các cell.

## Kết hợp nhiều grid

Không có quy tắc nào bắt buộc toàn bộ maze phải dùng một loại cell.

Ví dụ một grid hình ngôi sao:

```text
trung tâm: square grid
các cánh: triangle grid
```

Thách thức chính không nằm ở maze algorithm, mà ở việc định nghĩa adjacency tại ranh giới giữa hai loại cell.

## Uniform tilings và Voronoi

Chương gợi ý nghiên cứu thêm:

- Uniform tilings.
- Wythoff construction.
- Voronoi diagrams.
- Truncated quadrille.
- Rhombitrihexagonal tiling.

Điều này mở rộng maze khỏi các polygon đều đơn giản sang graph có hình học phức tạp hơn.

## Upsilon maze

Một ví dụ là tessellation kết hợp:

- Hình bát giác đều.
- Hình vuông.

Maze tạo từ kiểu lát này được gọi là **upsilon maze**. Một cell có thể có số cạnh và số neighbor khác nhau tùy loại hình.

---

# 21. Bài học kiến trúc quan trọng

Chapter 8 củng cố nguyên tắc đã xuất hiện từ Chapter 7:

> Maze generation thuộc về topology; hình dạng cell thuộc về geometry và rendering.

Một thiết kế tốt nên chia thành:

```text
Cell topology
    ↓
Danh sách neighbors

Maze generation
    ↓
Chọn neighbor nào được link

Cell geometry
    ↓
Tính polygon của từng cell

Rendering
    ↓
Vẽ những cạnh chưa được link
```

Thuật toán tổng quát không nên truy cập trực tiếp:

```text
north
south
east
west
```

Thay vào đó, nó nên dùng:

```ts
const candidates = current.neighbors();
```

Đây là lý do Recursive Backtracker dễ tái sử dụng hơn Binary Tree.

---

# 22. Liên hệ với `MazeModelV1` của bạn

Model hiện tại lưu node bằng một điểm:

```ts
nodes: Record<string, {
  id: string;
  position: Vec2;
}>;
```

Điều này chưa đủ để render chính xác hex cell hoặc triangle cell. Nên bổ sung geometry của vùng cell:

```ts
type CellGeometry =
  | {
      type: "rect";
      x: number;
      y: number;
      width: number;
      height: number;
    }
  | {
      type: "hex";
      center: Vec2;
      radius: number;
      vertices: Vec2[];
    }
  | {
      type: "triangle";
      center: Vec2;
      upright: boolean;
      vertices: [Vec2, Vec2, Vec2];
    };
```

Node:

```ts
interface MazeNode {
  id: string;
  position: Vec2;
  geometry: CellGeometry;
  neighbors: string[];
}
```

Tuy nhiên, nên phân biệt hai loại edge:

```ts
interface TopologyEdge {
  id: string;
  from: string;
  to: string;
}

interface PassageEdge extends TopologyEdge {
  carved: boolean;
}
```

Hoặc tốt hơn:

```ts
interface MazeTopology {
  nodes: Record<string, MazeNode>;
  adjacencies: Record<string, TopologyEdge>;
}

interface MazeSolution {
  passages: Set<string>;
}
```

Pipeline:

```text
createHexGrid / createTriangleGrid
        ↓
tính neighbor topology
        ↓
chạy Recursive Backtracker
        ↓
đánh dấu carved passages
        ↓
renderer vẽ cạnh không được carve
```

Với kiến trúc này, cùng một maze algorithm có thể chạy trên:

```text
RectGrid
PolarGrid
HexGrid
TriangleGrid
MaskedGrid
```

mà không cần sửa code của thuật toán.

---

# Tóm tắt trọng tâm

Chapter 8 trình bày hai grid mới:

### Hex grid

- Mỗi cell có tối đa sáu neighbor.
- Các cột được bố trí so le.
- Renderer dùng sáu đỉnh của regular hexagon.
- Maze được gọi là sigma maze.

### Triangle grid

- Cell luân phiên hướng lên và xuống.
- Orientation xác định bằng `(row + column).even?`.
- Mỗi cell có tối đa ba neighbor.
- Renderer vẽ ba cạnh tam giác.
- Maze được gọi là delta maze.

Ý tưởng quan trọng nhất:

> Muốn hỗ trợ một loại grid mới, không cần viết lại toàn bộ hệ thống. Chỉ cần định nghĩa cell, adjacency và geometry render; các maze algorithm tổng quát có thể được tái sử dụng.
