# Go 语言速通：从 Python 到 Go

> **面向人群：** 已完成 CS61A、熟悉 Python 基础语法的学员  
> **目标：** 2–3 小时建立 Go 核心语法体系，能独立编写 200 行以内的命令行小工具

---

## 1. 环境搭建与第一个 Go 项目

```bash
brew install go   # macOS
go version        # 应输出 go1.22+
```

Go 使用 **module** 管理依赖（类似 Python 的 `venv` + `pyproject.toml`）：

```bash
mkdir hello-go && cd hello-go
go mod init github.com/你的用户名/hello-go
```

生成 `go.mod`（声明模块路径与 Go 版本）和 `go.sum`（依赖版本与哈希校验，锁定完整构建环境）。第三方库用 `go get` 拉取，自动更新 `go.mod`。**关键差异**：Go 没有 `pip install`，依赖声明即下载；每个 `.go` 文件第一行必须是 `package 包名`。

---

## 2. 变量与基本类型：告别动态类型

```go
var name string = "Alice"   // 完整声明
var score = 95.5            // 类型推断为 float64
count := 0                  // 短声明，仅函数内可用
```

| Python | Go |
|---|---|
| `x = 10` 运行时确定类型 | `x := 10` 编译期推断，之后类型不可变 |
| 可随时赋不同类型值 | 类型一旦确定，永不可变 |
| 无零值概念 | 未初始化变量自动获得零值：`int`→0, `string`→"", 指针/slice/map→nil |

**陷阱**：短声明 `:=` 不能在包级使用；多变量声明时至少有一个新变量才能用 `:=`。

**基本类型**：`int`（平台相关）、`float64`（默认浮点）、`bool`、`string`（UTF-8，`len` 返回字节数）、`rune`（Unicode 码点，别名 `int32`）、`byte`（`uint8`）。类型转换必须显式：`int(3.14)`。

---

## 3. 控制流：只有 `for`，没有 `while`

```go
for i := 0; i < 10; i++ { }   // 标准循环
for sum < 100 { sum += 1 }    // 条件循环（while）
for { break }                 // 无限循环
```

`if` 可带短声明：`if err := do(); err != nil { return err }`。  
`switch` 默认不穿透，无需 `break`；支持多值匹配和类型分支：

```go
switch x.(type) {
case int: ...
case string: ...
}
```

**陷阱**：`for range` 遍历 slice 时，`val` 是元素副本，修改它不影响原 slice；遍历 map 顺序随机。

---

## 4. 复合类型：slice、map、struct

### Slice — 底层数组的“视图”

```go
s := []int{1,2,3}
s = append(s, 4)          // 返回新 slice，可能更换底层数组
sub := s[1:3]             // 共享底层数组！
```

**核心陷阱**：截取后的 slice 与原 slice 共享底层数组，修改 `sub` 会影响 `s`；但当 `append` 超出容量时，会分配新数组，两者脱离关系。使用 `copy(dst, src)` 可避免共享。

### Map — 类型安全的 dict

```go
m := map[string]int{"Alice": 90}
score, ok := m["Bob"]    // 安全取值，ok 表示是否存在
```

map 的 key/value 类型固定，遍历顺序随机，并发不安全（需 `sync.Mutex`）。

### Struct — 组合优于继承

```go
type Person struct { Name string; Age int }
type Employee struct {
    Person                // 嵌入，Employee 可直接访问 Name/Age
    Salary int
}
```

Go 没有类继承，通过嵌入实现复用。方法集规则：值接收者方法可通过值或指针调用；指针接收者方法只能通过指针调用。

---

## 5. 函数与方法：多返回值与接收者

```go
func div(a, b float64) (float64, error) {
    if b == 0 { return 0, fmt.Errorf("除数不能为零") }
    return a / b, nil
}
```

**方法**：`func (p Person) Greet() string { ... }`  
值接收者操作副本，指针接收者（`*Person`）可修改原值。**陷阱**：接口实现时，若方法使用指针接收者，则只有指针类型满足接口。

---

## 6. Interface：编译期鸭子类型

```go
type Stringer interface { String() string }
// Person 实现 String() 即自动满足 Stringer，无需显式声明
func PrintInfo(s Stringer) { fmt.Println(s.String()) }
```

空接口 `any`（即 `interface{}`）可接收任意类型。**关键陷阱**：接口变量内部包含 `(动态类型, 动态值)`，只有两者都为 `nil` 时接口才为 `nil`。例如 `var w io.Writer = (*os.File)(nil)`，此时 `w != nil`，会引发运行时 panic。类型断言安全写法：`v, ok := x.(T)`。

---

## 7. 错误处理：`if err != nil` 哲学

Go 没有 `try/except`，函数返回 `(result, error)`，调用方必须显式处理：

```go
data, err := os.ReadFile("config.json")
if err != nil {
    log.Fatalf("读取失败: %v", err)
}
```

**错误包装**：`fmt.Errorf("...: %w", err)` 保留原始错误链，便于 `errors.Is` / `errors.As` 判定。**哲学**：错误即值，迫使开发者直面每个失败路径。

---

## 8. defer：延迟执行的利器

```go
f, _ := os.Open("file")
defer f.Close()   // 函数返回前执行，LIFO 顺序
```

**陷阱**：`defer` 语句的参数在声明时立即求值（而非执行时）；若 defer 闭包捕获循环变量，Go 1.22 前会取最终值（经典 bug）。命名返回值可被 defer 修改。

---

## 9. 指针：显式但安全

```go
x := 10
p := &x; *p = 20   // 通过指针修改 x
```

Go 无指针运算，避免了内存踩踏。指针用于：修改原值、避免大 struct 拷贝、表示可空语义（`nil`）。`new(T)` 返回 `*T` 并初始化为零值。

---

## 10. 迷你实战：命令行待办事项工具

以下约 80 行程序综合运用了上述知识点（支持 `add` / `list` / `done` / `exit`）：

```go
package main

import (
    "bufio"; "fmt"; "os"; "strconv"; "strings"
)

type Todo struct { ID int; Task string; Done bool }
type TodoList struct { items []Todo; nextID int }

func (tl *TodoList) Add(task string) {
    tl.items = append(tl.items, Todo{ID: tl.nextID, Task: task})
    tl.nextID++
}
func (tl *TodoList) List() {
    for _, t := range tl.items {
        status := " "; if t.Done { status = "✓" }
        fmt.Printf("[%s] %d: %s\n", status, t.ID, t.Task)
    }
}
func (tl *TodoList) Done(id int) error {
    for i := range tl.items {
        if tl.items[i].ID == id { tl.items[i].Done = true; return nil }
    }
    return fmt.Errorf("未找到 ID=%d", id)
}

func main() {
    tl := &TodoList{nextID: 1}
    scanner := bufio.NewScanner(os.Stdin)
    for { fmt.Print("> "); scanner.Scan()
        parts := strings.SplitN(strings.TrimSpace(scanner.Text()), " ", 2)
        switch parts[0] {
        case "add": if len(parts)>1 { tl.Add(parts[1]) }
        case "list": tl.List()
        case "done": id,_ := strconv.Atoi(parts[1]); tl.Done(id)
        case "exit": return
        }
    }
}
```

**运行**：`go mod init todo && go run .`  
**扩展练习**：添加文件持久化（`encoding/json` + `os.WriteFile`），体会错误处理与指针的实战价值。

---

## 11. 速查：Python → Go 对照表

| 概念 | Python | Go |
|---|---|---|
| 变量 | `x = 10` | `x := 10` / `var x int = 10` |
| 常量 | `X = 10`（约定） | `const X = 10`（强制） |
| 列表 | `[1,2,3]` | `[]int{1,2,3}` |
| 字典 | `{"a":1}` | `map[string]int{"a":1}` |
| 类/方法 | `class Dog:` / `def bark(self)` | `type Dog struct{}` + `func (d Dog) Bark()` |
| 异常 | `try/except/raise` | `if err != nil` / `return err` |
| 资源管理 | `with ... as f:` | `defer f.Close()` |
| 包管理 | `pip install` / `venv` | `go get` / `go mod` |
| 空值 | `None` | `nil`（仅指针/slice/map/interface/chan/func） |
| 遍历 | `for k,v in d.items()` | `for k,v := range m {}` |
| 入口 | `if __name__ == "__main__"` | `package main` + `func main()` |

---

## 12. 下一步：并发

Go 的杀手锏是 **goroutine** 与 **channel**——轻量级协程与 CSP 通信模型。下一单元将深入 `go func()`、`chan`、`select` 及同步原语，这些是 Go 在服务端称霸的根基。

*本单元覆盖了 Go 日常语法的 80%。立即动手用 `go mod init` 创建项目，跑通待办事项工具，并尝试添加“保存到文件”功能——这是练习 `os.WriteFile` + `encoding/json` 的绝佳切入点。*