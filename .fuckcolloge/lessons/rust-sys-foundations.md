# Rust 系统编程基础与 Linux 环境搭建

## 一、Linux 开发环境与 Cargo 快速上手

### 1.1 安装 Rust 工具链
通过 `rustup` 一键安装：
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```
安装后获得 `rustc`、`cargo` 和工具链管理器。验证：
```bash
rustc --version   # e.g. 1.84.0
cargo --version
```
`rustup` 支持 stable/beta/nightly 三通道。编写 freestanding 程序时，若需自定义 `eh_personality` 等实验特性，可安装 nightly：
```bash
rustup toolchain install nightly
rustup override set nightly   # 仅当前项目使用
```
但稳定版已支持 `#![no_std]` 和 `#[panic_handler]`，只需在 `Cargo.toml` 中设置 `panic = "abort"` 即可避免需要 `eh_personality`。

### 1.2 Cargo 项目生命周期
核心命令速查：

| 命令 | 作用 |
|------|------|
| `cargo new <name>` | 创建项目（`Cargo.toml` + `src/main.rs`） |
| `cargo build` | debug 编译，产物在 `target/debug/` |
| `cargo build --release` | 优化编译，产物在 `target/release/` |
| `cargo run` | 编译并运行 |
| `cargo check` | 仅类型检查，极快，适合开发中验证 |
| `cargo add <crate>` | 添加依赖（Rust ≥1.62 内置） |

`Cargo.toml` 记录元数据与依赖，`Cargo.lock` 锁定精确版本。Cargo 自动解析依赖图并调用 `rustc`。

---

## 二、所有权、借用与生命周期 —— 内存安全三定律

### 2.1 所有权（Ownership）
三条铁律：
1. 每个值有且仅有一个所有者。
2. 所有者离开作用域，值被 `drop`。
3. 所有权可转移（move），转移后原变量失效。

```rust
let s1 = String::from("hello");
let s2 = s1;          // s1 所有权移动至 s2
// println!("{s1}");  // 编译错误：s1 已失效
```
实现 `Copy` trait 的类型（如 `i32`、`bool`、`&T` 等）赋值时自动按位复制，不发生 move。`String`、`Vec` 等堆类型不实现 `Copy`，赋值即 move。

**陷阱**：结构体部分移动（partial move）会导致整体不可用，除非仅移动 Copy 字段。例如：
```rust
let p = (String::from("hi"), 42);
let s = p.0;   // p.0 被移动
// println!("{:?}", p);  // 错误：p 整体部分移动后无效
```

### 2.2 借用（Borrowing）
- `&T`：不可变借用，可同时存在多个。
- `&mut T`：可变借用，同一时刻仅一个，且与不可变借用互斥。

```rust
let mut v = vec![1,2,3];
let r1 = &v;
let r2 = &v;         // 允许多个不可变借用
// let rm = &mut v;  // 错误：存在不可变借用
println!("{r1} {r2}");
let rm = &mut v;     // 合法：r1、r2 不再使用（NLL 非词法生命周期）
rm.push(4);
```
**NLL（Non-Lexical Lifetimes）** 自 Rust 2018 起默认启用，编译器基于控制流图缩短借用范围，使更多代码通过检查。但核心规则不变：作用域内不能同时存在读写冲突。

### 2.3 生命周期（Lifetime）
生命周期标注是编译器验证引用有效范围的“契约”，不改变运行时行为。多数情况可自动推导（省略规则），但函数返回引用且涉及多个输入时需显式标注：
```rust
fn longest<'a>(x: &'a str, y: &'a str) -> &'a str {
    if x.len() > y.len() { x } else { y }
}
```
`'a` 表示返回引用的生命周期等于 `x` 和 `y` 中较短的那个。调用处编译器据此检查：
```rust
let s1 = String::from("long");
let result;
{
    let s2 = String::from("short");
    result = longest(&s1, &s2); // result 生命周期为 s2 的作用域
}
// println!("{result}"); // 错误：s2 已释放
```
**省略规则**：每个输入引用获得独立生命周期，若只有一个输入引用则输出生命周期与之相同；方法中 `&self`/`&mut self` 的生命周期赋给输出。

---

## 三、智能指针 —— 超越引用的堆管理工具箱

### 3.1 `Box<T>` —— 独占堆分配
用于递归类型、转移大数据所有权、trait object：
```rust
enum List { Cons(i32, Box<List>), Nil }
let b = Box::new(5); // 堆上分配，自动释放
```

### 3.2 `Rc<T>` / `Arc<T>` —— 共享所有权
- `Rc<T>`：单线程引用计数，非原子操作，开销低。
- `Arc<T>`：原子引用计数，线程安全。

```rust
use std::rc::Rc;
let a = Rc::new(String::from("shared"));
let b = Rc::clone(&a);   // 计数 +1，不复制数据
let c = Rc::clone(&a);
assert_eq!(Rc::strong_count(&a), 3);
```
`Rc<T>` 默认只提供不可变访问。若需可变性，可搭配 `RefCell`，或当引用计数为 1 时使用 `Rc::get_mut`。`Rc::make_mut` 提供写时克隆（clone-on-write）语义。

**陷阱**：`Rc<RefCell<T>>` 可能产生循环引用导致内存泄漏，此时应使用 `Weak<T>` 打破循环。

### 3.3 `RefCell<T>` —— 内部可变性
将借用检查推迟到运行时：允许在持有不可变引用时修改内部值。违反规则（如同时两个 `borrow_mut()`）会触发 **panic**。
```rust
use std::cell::RefCell;
let data = RefCell::new(42);
*data.borrow_mut() += 1;   // 运行时可变借用
```
可用 `try_borrow()` / `try_borrow_mut()` 返回 `Result` 避免 panic。

**经典组合** `Rc<RefCell<T>>`：单线程下多个所有者共享可变数据。

| 智能指针 | 所有权 | 可变性 | 线程安全 | 检查时机 |
|----------|--------|--------|----------|----------|
| `Box<T>` | 独占 | 是 | 是 | 编译期 |
| `Rc<T>` | 共享 | 否（需 RefCell） | 否 | 编译期 |
| `Arc<T>` | 共享 | 否（需 Mutex） | 是 | 编译期 |
| `RefCell<T>` | 不涉及 | 内部可变 | 否 | 运行时 |

---

## 四、unsafe Rust 与 FFI 边界

五类 unsafe 超能力：
1. 解引用裸指针
2. 调用 unsafe 函数（含 FFI）
3. 访问/修改可变静态变量
4. 实现 unsafe trait
5. 访问 union 字段

```rust
let mut num = 5;
let r1 = &num as *const i32;
let r2 = &mut num as *mut i32;
unsafe {
    *r2 = 10;
    println!("{}", *r1);
}
```
**FFI 示例**（调用 C 标准库）：
```rust
extern "C" { fn strlen(s: *const std::ffi::c_char) -> usize; }
fn main() {
    let s = std::ffi::CString::new("hello").unwrap();
    let len = unsafe { strlen(s.as_ptr()) };
    println!("{len}");
}
```
**陷阱**：`CString` 拥有所有权，`as_ptr()` 返回的指针在 `CString` 被 drop 后失效，unsafe 块必须保证指针有效期内使用。暴露 Rust 函数给 C：
```rust
#[no_mangle]
pub extern "C" fn add(a: i32, b: i32) -> i32 { a + b }
```
**最佳实践**：将 unsafe 代码封装在安全抽象后，如 `Vec` 内部用 unsafe 操作裸指针，对外提供安全 API。

---

## 五、Freestanding Rust Binary —— 脱离标准库

### 5.1 最小 no_std 程序
```rust
#![no_std]
#![no_main]

use core::panic::PanicInfo;

#[panic_handler]
fn panic(_info: &PanicInfo) -> ! {
    loop {}   // 裸机下最简单的处理
}

#[no_mangle]
pub extern "C" fn _start() -> ! {
    // 内核入口
    loop {}
}
```
- `#![no_std]` 不链接 `std`，但可使用 `core`（提供 `Option`、`Result` 等）。
- `#[panic_handler]` 必须定义，稳定版可用。
- 若使用稳定版，需在 `Cargo.toml` 添加 `[profile.dev] panic = "abort"` 和 `[profile.release] panic = "abort"` 以避免需要 `eh_personality` 语言项。
- `_start` 为 ELF 入口，`extern "C"` 确保 C ABI，`#[no_mangle]` 禁止名称修饰。

### 5.2 编译与链接
安装裸机目标：
```bash
rustup target add x86_64-unknown-none
cargo build --target x86_64-unknown-none
```
自定义链接脚本（`linker.ld`）指定内存布局，在 `.cargo/config.toml` 中配置：
```toml
[target.'cfg(target_os = "none")']
rustflags = ["-C", "link-arg=-Tlinker.ld"]
```
在用户态模拟 OS 时，可继续使用宿主目标（如 `x86_64-unknown-linux-gnu`）但禁用 `std`，便于用 GDB 调试。

### 5.3 扩展：实现简易 println!
通过 `core::fmt::Write` 可构建不依赖 `std` 的格式化输出。例如向 VGA 文本缓冲区写入：
```rust
use core::fmt::Write;
struct VgaWriter { offset: usize }
impl Write for VgaWriter {
    fn write_str(&mut self, s: &str) -> core::fmt::Result {
        // 将 s 逐字节写入 0xb8000 + offset
        Ok(())
    }
}
// 宏封装
macro_rules! println {
    ($($arg:tt)*) => { writeln!(VgaWriter { offset: 0 }, $($arg)*).unwrap(); }
}
```
这展示了脱离标准库后仍能利用 Rust 强大的 trait 系统构建安全抽象。

---

**延伸阅读**：The Rust Book 第 4-10 章；Philipp Oppermann 的 *Writing an OS in Rust* 系列；Rust Nomicon 的 unsafe 与 FFI 章节。