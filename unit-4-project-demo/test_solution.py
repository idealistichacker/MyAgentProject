import unittest
import os
import sys
import tempfile
import shutil
import json

# Ensure parent directory is in sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from solution import (
    ToolRegistry,
    make_read_file_tool,
    make_write_file_tool,
    make_run_python_tool,
    build_default_registry,
    AgentState,
    parse_llm_response,
    build_prompt,
    react_loop
)

class TestAgentSkeleton(unittest.TestCase):
    
    def setUp(self):
        self.test_dir = tempfile.mkdtemp()
        
    def tearDown(self):
        shutil.rmtree(self.test_dir)
        
    def test_tool_registry(self):
        registry = ToolRegistry()
        
        def mock_tool(val: str) -> str:
            return f"Mocked {val}"
            
        registry.register(
            name="mock_tool",
            func=mock_tool,
            description="A mock tool for testing",
            signature={"val": "str"}
        )
        
        schemas = registry.get_schemas()
        self.assertEqual(len(schemas), 1)
        self.assertEqual(schemas[0]["name"], "mock_tool")
        self.assertEqual(schemas[0]["signature"], {"val": "str"})
        
        res = registry.execute("mock_tool", {"val": "hello"})
        self.assertEqual(res, "Mocked hello")
        
        res_err = registry.execute("non_existent", {})
        self.assertIn("Error: Tool 'non_existent' not found", res_err)
        
        def buggy_tool():
            raise RuntimeError("something went wrong")
            
        registry.register("buggy", buggy_tool, "A buggy tool")
        res_bug = registry.execute("buggy", {})
        self.assertIn("Error executing tool 'buggy'", res_bug)
        
    def test_read_file_tool(self):
        filepath = os.path.join(self.test_dir, "test.txt")
        file_content = "\n".join([f"Line {i}" for i in range(1, 10)])
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(file_content)
            
        read_tool = make_read_file_tool(max_lines=5)
        
        res = read_tool(filepath, start_line=1, end_line=3)
        expected = "  1| Line 1\n  2| Line 2\n  3| Line 3"
        self.assertEqual(res, expected)
        
        res_trunc = read_tool(filepath, start_line=1)
        self.assertIn("[TRUNCATED] File has 9 lines.", res_trunc)
        self.assertIn("  5| Line 5", res_trunc)
        self.assertNotIn("  6| Line 6", res_trunc)
        
        res_missing = read_tool(os.path.join(self.test_dir, "missing.txt"))
        self.assertIn("Error: File", res_missing)
        
    def test_write_file_tool(self):
        filepath = os.path.join(self.test_dir, "write_test.txt")
        write_tool = make_write_file_tool()
        
        res = write_tool(filepath, "hello world from atomic write")
        self.assertIn("Successfully wrote", res)
        self.assertTrue(os.path.exists(filepath))
        
        with open(filepath, 'r', encoding='utf-8') as f:
            self.assertEqual(f.read(), "hello world from atomic write")
            
    def test_run_python_tool(self):
        good_py = os.path.join(self.test_dir, "good.py")
        with open(good_py, 'w', encoding='utf-8') as f:
            f.write("print('Hello from good.py')")
            
        run_tool = make_run_python_tool(timeout=2)
        res = run_tool(good_py)
        self.assertIn("EXIT_CODE: 0", res)
        self.assertIn("Hello from good.py", res)
        
        sleep_py = os.path.join(self.test_dir, "sleep.py")
        with open(sleep_py, 'w', encoding='utf-8') as f:
            f.write("import time\ntime.sleep(5)\nprint('Done')")
            
        res_timeout = run_tool(sleep_py)
        self.assertIn("Error: Execution timed out", res_timeout)
        
    def test_agent_state_and_history(self):
        state = AgentState(task="Fix scheme_buggy.py", max_retries=5, window_size=2)
        
        state.add_observation("Initial compile failed.")
        self.assertEqual(len(state.history), 1)
        self.assertEqual(state.history[0]["role"], "observation")
        
        state.add_action("read_file", {"filepath": "a.py"}, "File contents...")
        self.assertEqual(len(state.history), 3)
        self.assertEqual(state.retries_left, 4)
        
        state.add_action("read_file", {"filepath": "a.py"}, "File contents...")
        state.add_action("read_file", {"filepath": "a.py"}, "File contents...")
        self.assertTrue(state.detect_repeat(threshold=3))
        
        context = state.get_context_for_llm()
        self.assertEqual(context[0]["role"], "summary")
        self.assertIn("[Earlier history: 3 entries omitted]", context[0]["content"])
        self.assertEqual(len(context), 5)
        
    def test_parse_llm_response(self):
        res_codeblock = "Here is my action:\n```json\n{\"tool\": \"read_file\", \"args\": {\"filepath\": \"test.py\"}}\n```"
        tool, args = parse_llm_response(res_codeblock)
        self.assertEqual(tool, "read_file")
        self.assertEqual(args, {"filepath": "test.py"})
        
        res_direct = "{\"tool\": \"write_file\", \"args\": {\"filepath\": \"out.py\"}}"
        tool, args = parse_llm_response(res_direct)
        self.assertEqual(tool, "write_file")
        
        res_bad = "```json\n{\"tool\": \"read_file\"\n```"
        with self.assertRaises(ValueError):
            parse_llm_response(res_bad)
            
        res_text = "I have finished the task. The program compiles now."
        tool, args = parse_llm_response(res_text)
        self.assertIsNone(tool)
        self.assertIsNone(args)
        
    def test_react_loop_execution(self):
        registry = build_default_registry()
        state = AgentState(task="Create and run a file", max_retries=5)
        
        call_count = 0
        def mock_llm(prompt: str) -> str:
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return json.dumps({
                    "tool": "write_file",
                    "args": {"filepath": os.path.join(self.test_dir, "run.py"), "content": "print('Run success')"}
                })
            elif call_count == 2:
                return json.dumps({
                    "tool": "run_python",
                    "args": {"filepath": os.path.join(self.test_dir, "run.py")}
                })
            else:
                return "All done!"
                
        final_state = react_loop(state, registry, mock_llm)
        self.assertTrue(final_state.is_done())
        self.assertTrue(final_state._done)
        self.assertEqual(call_count, 3)

if __name__ == "__main__":
    unittest.main()
