# Tóm tắt Chapter 7 — _Going in Circles_

Chapter 7 giải thích cách tạo **maze hình tròn thực sự**, thay vì dùng mask hình tròn trên lưới vuông. Kỹ thuật chính là thay lưới orthogonal bằng **polar grid**: các cell được sắp xếp thành nhiều vòng đồng tâm và các sector hướng tâm. Loại maze này còn được gọi là **theta maze** hoặc **circle maze**.

---

## 1. Vì sao không dùng mask hình tròn?

Ở Chapter 6, ta có thể tạo mask hình tròn rồi đặt maze vuông bên trong:

```text
████░░████
██░░░░░░██
█░░░░░░░░█
██░░░░░░██
████░░████
```

Cách này hoạt động, nhưng đường tròn bị “pixel hóa”:

- Biên ngoài lởm chởm.
- Passage vẫn chỉ đi ngang hoặc dọc.
- Các đường cong chỉ là xấp xỉ bằng ô vuông.
- Maze không có cảm giác thực sự xoay quanh tâm.

Nguyên nhân là lưới vuông được xây dựng từ các hàng và cột vuông góc. Nó phù hợp với đường thẳng ngang/dọc, nhưng không phù hợp với hình tròn.

Giải pháp của chương là dùng **polar grid**.

---

# 2. Polar grid là gì?

Một polar grid gồm:

- Nhiều **vòng đồng tâm**.
- Mỗi vòng được chia thành nhiều **sector**.
- Cell gần tâm có ít sector hơn.
- Cell xa tâm có nhiều sector hơn.

Một cell không còn được xác định bởi:

```text
row, column
```

theo nghĩa hàng/cột thông thường, mà có thể hiểu là:

```text
ring, sector
```

Trong code của sách vẫn dùng tên:

```ruby
row
column
```

nhưng:

- `row` là chỉ số vòng tròn.
- `column` là vị trí góc trong vòng đó.

Ví dụ:

```text
row 0 → tâm
row 1 → vòng đầu tiên
row 2 → vòng thứ hai
row 3 → vòng thứ ba
```

---

# 3. Hệ thống neighbor trong polar grid

Ở grid vuông, một cell thường có bốn hướng:

```text
north
south
east
west
```

Trong polar grid, các hướng tự nhiên hơn là:

```text
clockwise
counterclockwise
inward
outward
```

Tương ứng:

- `clockwise`: cell kế bên theo chiều kim đồng hồ.
- `counterclockwise`: cell kế bên ngược chiều kim đồng hồ.
- `inward`: cell gần tâm hơn.
- `outward`: một hoặc nhiều cell xa tâm hơn.

Điểm khác biệt quan trọng nhất là:

> Một cell có thể có nhiều neighbor ở phía ngoài.

Ví dụ, một cell ở vòng trong có thể nối tới hai cell ở vòng kế tiếp:

```text
        outward A
       /
cell trong
       \
        outward B
```

Vì chu vi tăng theo bán kính, vòng ngoài cần nhiều cell hơn vòng trong. Do đó quan hệ neighbor không còn luôn là 1–1.

---

# 4. `PolarCell`

Sách tạo một loại cell mới:

```ruby
class PolarCell < Cell
  attr_accessor :cw, :ccw, :inward
  attr_reader :outward
end
```

Trong đó:

```text
cw       → clockwise
ccw      → counterclockwise
inward   → cell phía trong
outward  → danh sách cell phía ngoài
```

`outward` phải là một mảng:

```ruby
@outward = []
```

vì một cell có thể có nhiều cell phía ngoài.

Phương thức `neighbors` cũng được override:

```ruby
def neighbors
  list = []
  list << cw if cw
  list << ccw if ccw
  list << inward if inward
  list.concat(outward)
  list
end
```

Điểm hay là các maze algorithm không cần hiểu khái niệm “tròn”. Chúng chỉ gọi:

```ruby
cell.neighbors
```

rồi chọn một neighbor hợp lệ.

---

# 5. Vấn đề khi chia tất cả vòng bằng nhau

Giả sử mỗi vòng có cùng số lượng cell:

```text
ring 1: 8 cells
ring 2: 8 cells
ring 3: 8 cells
ring 4: 8 cells
```

Các cell ở vòng ngoài sẽ ngày càng rộng theo chiều tiếp tuyến, nhưng chiều cao theo bán kính vẫn giữ nguyên.

Kết quả:

- Cell gần tâm nhỏ và tương đối vuông.
- Cell xa tâm dài, bẹt và méo.
- Passage ở ngoài rất rộng.
- Maze trông mất cân đối.

Lý do là chu vi tăng theo công thức:

[
C = 2\pi r
]

Khi bán kính tăng, vòng ngoài dài hơn, nên cần nhiều cell hơn để giữ kích thước cell tương đối đồng đều.

---

# 6. Adaptive subdivision

Đây là ý tưởng quan trọng nhất của chương.

Thay vì định trước số sector cho mọi vòng, mỗi vòng được chia thích ứng dựa trên chu vi của nó.

Quy trình cơ bản:

1. Chọn số vòng `rows`.
2. Xem toàn bộ grid là đường tròn bán kính 1.
3. Chiều cao của mỗi vòng:

[
rowHeight = \frac{1}{rows}
]

4. Với mỗi vòng, tính bán kính trong:

[
innerRadius = \frac{row}{rows}
]

5. Tính chu vi tại bán kính đó:

[
circumference = 2\pi \times innerRadius
]

6. Ước lượng độ rộng cell nếu giữ nguyên số cell của vòng trước:

[
estimatedCellWidth =
\frac{circumference}{previousCellCount}
]

7. So sánh độ rộng đó với chiều cao lý tưởng:

[
ratio =
round\left(
\frac{estimatedCellWidth}{rowHeight}
\right)
]

8. Số cell của vòng hiện tại:

[
currentCellCount =
previousCellCount \times ratio
]

Thông thường `ratio` sẽ là:

```text
1 → giữ nguyên số cell
2 → chia đôi mỗi cell của vòng trước
```

Vòng gần tâm có thể có ratio lớn hơn vì cell trung tâm chỉ có một.

Kết quả thường giống:

```text
ring 0:  1 cell
ring 1:  6 cells
ring 2: 12 cells
ring 3: 12 cells
ring 4: 24 cells
ring 5: 24 cells
```

Số lượng cell chỉ tăng khi các cell bắt đầu trở nên quá rộng.

---

# 7. Cell ở tâm là trường hợp đặc biệt

Nếu chia tâm thành nhiều sector, tất cả các đường bán kính sẽ gặp nhau tại một điểm, khiến cell trung tâm cực nhỏ và khó xử lý.

Do đó sách buộc vòng đầu tiên chỉ có một cell:

```ruby
grid[0] = [PolarCell.new(0, 0)]
```

Cell này đại diện cho toàn bộ tâm maze.

Các cell ở vòng 1 đều có `inward` trỏ về cell trung tâm.

---

# 8. Xây dựng adjacency

Sau khi tạo số lượng cell cho từng vòng, `configure_cells` thiết lập neighbor.

## Clockwise và counterclockwise

Các cell trong cùng vòng kết nối vòng quanh:

```ruby
cell.cw  = self[row, column + 1]
cell.ccw = self[row, column - 1]
```

Chỉ số column phải wrap-around:

```text
cell cuối → clockwise → cell đầu
cell đầu  → counterclockwise → cell cuối
```

Ví dụ với 8 cell:

```text
column -1 → column 7
column 8  → column 0
```

Điều này khác grid vuông: polar grid không có biên trái hoặc phải.

## Inward và outward

Để tìm cell phía trong, ta so sánh số cell giữa hai vòng:

```ruby
ratio = current_row.length / previous_row.length
parent = previous_row[column / ratio]
```

Sau đó:

```ruby
cell.inward = parent
parent.outward << cell
```

Ví dụ:

```text
vòng trong:  6 cells
vòng ngoài: 12 cells
ratio = 2
```

Khi đó:

```text
outer[0], outer[1]  → inner[0]
outer[2], outer[3]  → inner[1]
outer[4], outer[5]  → inner[2]
```

Đây là quan hệ nhiều–một khi nhìn từ ngoài vào, và một–nhiều khi nhìn từ trong ra.

---

# 9. Random cell và size

`PolarGrid` vẫn cần hỗ trợ API chung của `Grid`.

## Chọn cell ngẫu nhiên

Không thể chọn:

```ruby
row = rand(rows)
column = rand(columns)
```

vì mỗi vòng có số lượng cell khác nhau.

Thay vào đó:

```ruby
row = rand(@rows)
column = rand(@grid[row].length)
```

## Đếm kích thước grid

Không thể dùng:

```ruby
rows * columns
```

Mà phải cộng số cell của từng vòng:

```ruby
@grid.reduce(0) { |sum, row| sum + row.length }
```

Những override này giúp các thuật toán như Recursive Backtracker vẫn hoạt động bình thường.

---

# 10. Render polar grid

Renderer của grid vuông không thể dùng lại trực tiếp. Với grid vuông, mỗi cell được render bằng bốn đoạn thẳng. Với polar grid, cell được giới hạn bởi:

- Hai đoạn hướng tâm.
- Một cung tròn phía trong.
- Một cung tròn phía ngoài.

Với mỗi cell, ta tính:

```text
theta        → góc của một cell
thetaCCW     → góc đầu
thetaCW      → góc cuối
innerRadius  → bán kính trong
outerRadius  → bán kính ngoài
```

Nếu vòng có `N` cells:

[
theta = \frac{2\pi}{N}
]

Góc của cell `column`:

[
theta_{ccw} = column \times theta
]

[
theta_{cw} = (column + 1) \times theta
]

Bán kính:

[
innerRadius = row \times cellSize
]

[
outerRadius = (row + 1) \times cellSize
]

Sau đó chuyển tọa độ cực sang Cartesian:

[
x = centerX + radius \times \cos(\theta)
]

[
y = centerY + radius \times \sin(\theta)
]

---

## Những wall cần vẽ

Tương tự grid vuông, không nên vẽ tất cả wall hai lần.

Mỗi cell chủ yếu vẽ:

### Wall phía trong

Vẽ cung tại `innerRadius` nếu cell không liên kết với `inward`.

### Wall theo chiều kim đồng hồ

Vẽ đoạn hướng tâm tại `thetaCW` nếu cell không liên kết với `cw`.

### Biên ngoài cùng

Vẽ một đường tròn bao ngoài toàn bộ maze.

Cell trung tâm là trường hợp đặc biệt và thường không cần vẽ cung phía trong.

---

# 11. Vẽ cung tròn bằng các đoạn nhỏ

Thư viện ChunkyPNG được dùng trong sách không cung cấp primitive vẽ cung tròn đủ tiện lợi. Vì vậy tác giả xấp xỉ cung bằng nhiều đoạn thẳng nhỏ:

```text
point 0 → point 1
point 1 → point 2
point 2 → point 3
...
```

Càng nhiều đoạn:

- Cung càng mượt.
- Render càng tốn thời gian.

Trong Canvas, SVG hoặc Fabric.js hiện đại, có thể dùng trực tiếp:

```text
arc
ellipse
SVG A command
```

nên không nhất thiết phải dùng cách xấp xỉ này.

---

# 12. Áp dụng maze algorithm

Sau khi `PolarCell.neighbors` và `PolarGrid` được cài đặt đúng, có thể dùng lại nhiều algorithm cũ:

```ruby
grid = PolarGrid.new(20)
RecursiveBacktracker.on(grid)
```

Recursive Backtracker phù hợp vì nó:

- Không giả định bốn hướng cố định.
- Chỉ cần danh sách neighbor.
- Không phụ thuộc hàng có cùng độ dài.
- Hoạt động tốt với topology bất quy tắc.

Ngược lại, Binary Tree và Sidewinder phụ thuộc nhiều vào hướng và cấu trúc hàng nên không thể áp dụng nguyên trạng.

Điểm kiến trúc quan trọng:

> Maze algorithm làm việc trên graph; hình tròn chỉ là cách graph được tổ chức và render.

---

# 13. Cách tạo lối vào và mục tiêu

Circle maze thường có một trong hai bố cục:

```text
Start ở ngoài → Goal ở tâm
```

hoặc:

```text
Start ở tâm → Goal ở ngoài
```

Để tạo entrance ở biên ngoài:

1. Chọn một cell thuộc vòng cuối.
2. Bỏ một đoạn của outer wall tương ứng với cell đó.

Tâm maze đã là một cell duy nhất nên rất tự nhiên để dùng làm goal.

Có thể dùng Dijkstra để:

- Tìm cell xa tâm nhất.
- Chọn start/goal tạo đường giải dài.
- Tô màu maze theo khoảng cách.
- Hiển thị solution từ ngoài vào tâm.

---

# 14. Các bài tập “Your Turn”

Chương gợi ý mở rộng polar grid theo nhiều cách:

## Elliptical maze

Biến đường tròn thành ellipse bằng cách dùng tỷ lệ khác nhau cho trục X và Y:

```text
x = centerX + radiusX × cos(theta)
y = centerY + radiusY × sin(theta)
```

Topology có thể giữ nguyên, chỉ thay renderer.

## Inset center

Thay vì một cell chiếm toàn bộ tâm, để lại một lỗ tròn ở giữa. Maze trở thành dạng vành khuyên.

## Irregular subdivisions

Không nhất thiết mọi cell của một vòng đều chia cùng ratio. Có thể chia một số cell nhưng giữ nguyên các cell khác, dù việc quản lý topology sẽ phức tạp hơn.

## Spiral maze

Thay các vòng đồng tâm bằng đường xoắn ốc hoặc làm lệch các sector giữa các vòng.

## Kết hợp mask với polar grid

Có thể vô hiệu hóa một số polar cell để tạo hình dạng rỗng hoặc họa tiết bên trong circle maze.

---

# 15. Bài học thiết kế chính

Chapter 7 cho thấy `Grid` không nhất thiết là ma trận chữ nhật.

Một grid thực chất gồm ba phần:

```text
Cells
+ adjacency
+ rendering geometry
```

Maze algorithm chỉ cần:

```text
cell.neighbors
cell.link(other)
cell.linked?(other)
```

Nó không cần biết cell là:

- Hình vuông.
- Sector tròn.
- Tam giác.
- Lục giác.
- Hay một node trong graph bất kỳ.

Kiến trúc tốt nên tách:

```text
Topology      → cell nào kề cell nào
Generation    → passage nào được mở
Geometry      → cell và wall được đặt ở đâu
Rendering     → biến geometry thành hình ảnh
```

---

# 16. Liên hệ với `MazeModelV1` của bạn

Model hiện tại của bạn dùng:

```ts
nodes: Record<string, {
  id: string;
  position: Vec2;
}>;
```

Điều này đủ để lưu tâm của polar cell, nhưng chưa đủ để renderer tái tạo chính xác sector và wall.

Với circle maze, nên bổ sung geometry riêng cho cell:

```ts
interface PolarCellGeometry {
  type: "polar-sector";

  center: Vec2;

  innerRadius: number;
  outerRadius: number;

  startAngle: number;
  endAngle: number;
}
```

Node có thể trở thành:

```ts
interface MazeNode {
  id: string;
  position: Vec2;

  geometry:
    | RectCellGeometry
    | PolarCellGeometry;
}
```

Topology vẫn lưu độc lập:

```ts
interface MazeAdjacency {
  from: string;
  to: string;
}
```

Sau khi chạy algorithm, chỉ những adjacency được carve mới trở thành passage.

Pipeline phù hợp:

```text
createPolarTopology
        ↓
generate maze passages
        ↓
convert cells to polar geometry
        ↓
build MazeModel
        ↓
render arcs and radial walls
```

Không nên tạo polar maze bằng cách đặt node trên vòng tròn rồi nối chúng bằng đường thẳng tùy ý. Cách đó biểu diễn graph được, nhưng không giữ đúng hình học của theta maze.

---

# Tóm tắt ngắn gọn

Chapter 7 giới thiệu **polar grid** để tạo maze hình tròn:

1. Mỗi hàng trở thành một vòng đồng tâm.
2. Mỗi vòng có số cell khác nhau.
3. Vòng ngoài được chia thích ứng để cell không quá rộng.
4. Neighbor đổi thành clockwise, counterclockwise, inward và outward.
5. Một cell có thể có nhiều outward neighbors.
6. Renderer dùng cung tròn và đoạn hướng tâm thay vì cạnh hình vuông.
7. Các maze algorithm tổng quát như Recursive Backtracker có thể được tái sử dụng gần như nguyên vẹn.

Ý tưởng quan trọng nhất của chương là:

> Không cần viết lại maze algorithm để tạo maze hình tròn; chỉ cần thay topology và cách render của grid.
