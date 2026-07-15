import os
import sys
import json
import shutil
from typing import Dict, Any

# 确保能引入 solution 中的模块
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from solution import (
    AgentState,
    build_default_registry,
    react_loop
)

# ----------------------------------------------------
# 方案 A：真实大模型客户端 (可选择配置)
# ----------------------------------------------------
def get_real_llm_response(prompt: str) -> str:
    """这里是接入真实 OpenAI/Gemini/DeepSeek API 的框架示范。
    
    小主只需要配置对应的环境变量，就能让 Agent 真正开动脑筋哦！
    """
    api_key = os.getenv("LLM_API_KEY")
    api_base = os.getenv("LLM_API_BASE", "https://api.openai.com/v1")
    model_name = os.getenv("LLM_MODEL", "gpt-4o")
    
    if not api_key:
        raise ValueError("LLM_API_KEY environment variable is not set.")
        
    try:
        import requests
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        data = {
            "model": model_name,
            "messages": [
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.0 # 调试代码要求确定性强，建议温度设为 0
        }
        response = requests.post(f"{api_base}/chat/completions", headers=headers, json=data, timeout=30)
        response.raise_for_status()
        content = response.json()["choices"][0]["message"]["content"]
        print(f"\n[Agent Brain - Real LLM Response]:\n{content}\n")
        return content
    except Exception as e:
        err_msg = f"Error contacting LLM API: {str(e)}"
        print(f"\n[Agent Brain - API Error]:\n{err_msg}\n")
        raise RuntimeError(err_msg)

# ----------------------------------------------------
# 方案 B：本地 Mock 模拟大模型 (用于无 API Key 的离线实战演示)
# ----------------------------------------------------
def get_mock_llm_response(prompt: str) -> str:
    """根据 Prompt 中的历史步骤，完美模拟 ReAct 决策链路。"""
    
    # 简单的基于关键词/交互记录的规则模拟
    # 模拟流程：
    # 1. 发现测试未跑过 -> 动作：run_python 跑测试
    # 2. 发现报错 RecursionError -> 动作：read_file 读文件
    # 3. 读到代码 buggy_factorial -> 动作：write_file 原子覆写修复
    # 4. 覆写成功 -> 动作：run_python 再次跑测试
    # 5. 测试 EXIT_CODE: 0 成功 -> 文本回复：修复完成，退场
    
    res = ""
    # 检查最后的历史
    if "EXIT_CODE: 0" in prompt and "Run success" in prompt:
        res = "我已成功完成任务！修复后的代码已经通过运行验证，输出结果符合预期。"
    elif "Successfully wrote" in prompt:
        res = json.dumps({
            "tool": "run_python",
            "args": {"filepath": "sandbox/buggy_factorial.py"}
        })
    elif "factorial(n)" in prompt and "BUG" in prompt:
        fixed_code = (
            "def factorial(n):\n"
            "    if n == 1:\n"
            "        return 1\n"
            "    return n * factorial(n - 1)\n\n"
            "if __name__ == '__main__':\n"
            "    res = factorial(5)\n"
            "    print(f'Run success! 5! = {res}')\n"
        )
        res = json.dumps({
            "tool": "write_file",
            "args": {
                "filepath": "sandbox/buggy_factorial.py",
                "content": fixed_code
            }
        })
    elif "RecursionError" in prompt or "maximum recursion depth exceeded" in prompt:
        res = json.dumps({
            "tool": "read_file",
            "args": {
                "filepath": "sandbox/buggy_factorial.py",
                "start_line": 1,
                "end_line": 10
            }
        })
    else:
        res = json.dumps({
            "tool": "run_python",
            "args": {"filepath": "sandbox/buggy_factorial.py"}
        })
        
    print(f"\n[Agent Brain - Mock LLM Response]:\n{res}\n")
    return res

# ----------------------------------------------------
# 实战测试主运行程序
# ----------------------------------------------------
def main():
    print("=" * 60)
    print("          * 自主调试 Agent 实战测试战场 *          ")
    print("=" * 60)
    
    # 1. 搭建沙盒目录
    sandbox_dir = "sandbox"
    if os.path.exists(sandbox_dir):
        shutil.rmtree(sandbox_dir)
    os.makedirs(sandbox_dir, exist_ok=True)
    
    # 2. 扔下一个“写着 Bug 并且带有测试运行入口”的待修复文件
    buggy_file = os.path.join(sandbox_dir, "buggy_factorial.py")
    buggy_code = (
        "def factorial(n):\n"
        "    if n == 1:\n"
        "        return 1\n"
        "    return n * factorial(n)  # <-- BUG: 应该为 factorial(n-1)\n\n"
        "if __name__ == '__main__':\n"
        "    # 触发 Bug 以便让 Agent 检测\n"
        "    print(factorial(5))\n"
    )
    with open(buggy_file, "w", encoding="utf-8") as f:
        f.write(buggy_code)
        
    print(f"[INFO] 已在本地目录创建沙盒: {sandbox_dir}")
    print(f"[INFO] 已植入包含无限递归 Bug 的代码文件: {buggy_file}")
    print("\n" + "=" * 60)
    print(f"[WAIT] 步骤 1: 最初的沙盒文件已生成。")
    print(f"请前往 IDE 或资源管理器查看：{os.path.abspath(buggy_file)}")
    print("【确认好后，请在此处按下 [Enter] 回车键】启动 Agent 自动修复...")
    print("=" * 60)
    input()
    
    # 3. 初始化 Agent 配置与工具箱
    registry = build_default_registry()
    state = AgentState(
        task=f"修复 {buggy_file} 中的 Bug，使其能够正常运行并输出正确的阶乘值。",
        max_retries=10,
        window_size=3
    )
    
    # 4. 选择 LLM 方案
    api_key = os.getenv("LLM_API_KEY")
    if api_key:
        print("[LLM MODEL] 检测到 LLM_API_KEY，正在采用【方案 A：真实大模型 API 模式】进行实战修复！")
        client = get_real_llm_response
    else:
        print("[LLM MODEL] 未检测到环境变量 LLM_API_KEY，正在采用【方案 B：本地 Mock 模式】演示 ReAct 闭环链路。")
        print("          (你可以设置环境变量 LLM_API_KEY 后再次运行，体验真实 AI 的威力！)")
        client = get_mock_llm_response
    
    print("-" * 60)
    print("[Agent Loop] 启动 ReAct 闭环循环，观察 Agent 行为：\n")
    
    # 5. 执行 ReAct 循环
    final_state = state
    try:
        final_state = react_loop(state, registry, client, max_iterations=6)
    except Exception as e:
        print(f"\n[FATAL ERROR] 运行中遭遇致命 API 错误: {e}")
        print("请检查你的 API 密钥、网络连接或 LLM_API_BASE 是否配置正确！")
    
    # 6. 展示最终战果
    print("\n" + "-" * 60)
    print("[Agent State] 执行终止。")
    print(f"  - 任务是否标记完成: {final_state._done}")
    print(f"  - 剩余重试次数 (max=10): {final_state.retries_left}")
    
    print("\n[Result] 让我们看看修改后沙盒里的文件内容：")
    with open(buggy_file, "r", encoding="utf-8") as f:
        print(f.read())
    
    print("\n" + "=" * 60)
    print(f"[WAIT] 步骤 2: Agent 已修改完毕。")
    print(f"请再次前往 IDE 或资源管理器中重新加载并查看：{os.path.abspath(buggy_file)}")
    print("【确认完毕后，请在此处按下 [Enter] 回车键】以安全清理沙盒并结束程序...")
    print("=" * 60)
    input()
    
    # 7. 清理临时沙盒目录
    if os.path.exists(sandbox_dir):
        shutil.rmtree(sandbox_dir)
        print("[Clean] 实战测试结束，沙盒目录已安全清理。")
    print("=" * 60)

if __name__ == "__main__":
    main()
