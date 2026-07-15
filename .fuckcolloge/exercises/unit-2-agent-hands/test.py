import json
import os
import tempfile
import shutil
from pathlib import Path

try:
    from solution import confine_path
except ImportError as e:
    tests = ["normal_file", "escape_dotdot", "escape_nested", "new_file", "null_byte", "deep_nested"]
    for t in tests:
        print(json.dumps({"name": t, "passed": False, "message": f"Import error: {e}", "expected": "...", "actual": "..."}))
    raise SystemExit(0)

tmpdir = tempfile.mkdtemp(prefix="agent_ws_")
workspace = Path(tmpdir).resolve()
(workspace / "src").mkdir(parents=True, exist_ok=True)
(workspace / "src" / "main.py").write_text("print('hello')")
(workspace / "a" / "b" / "c").mkdir(parents=True, exist_ok=True)

def tr(name, passed, expected="", actual="", message=""):
    print(json.dumps({"name": name, "passed": passed, "expected": expected, "actual": actual, "message": message}))

# Test 1: Normal file path within workspace
try:
    result = confine_path(workspace, "src/main.py")
    expected = str(workspace / "src" / "main.py")
    tr("normal_file", str(result) == expected, expected, str(result))
except Exception as e:
    tr("normal_file", False, str(workspace / "src" / "main.py"), "", f"{type(e).__name__}: {e}")

# Test 2: Escape via ..
try:
    result = confine_path(workspace, "../../../etc/passwd")
    tr("escape_dotdot", False, "PermissionError", str(result), "Should have raised PermissionError")
except PermissionError:
    tr("escape_dotdot", True, "PermissionError", "PermissionError")
except Exception as e:
    tr("escape_dotdot", False, "PermissionError", type(e).__name__, f"Wrong exception: {e}")

# Test 3: Escape via nested ..
try:
    result = confine_path(workspace, "src/../../../etc/passwd")
    tr("escape_nested", False, "PermissionError", str(result), "Should have raised PermissionError")
except PermissionError:
    tr("escape_nested", True, "PermissionError", "PermissionError")
except Exception as e:
    tr("escape_nested", False, "PermissionError", type(e).__name__, f"Wrong exception: {e}")

# Test 4: New file that doesn't exist yet
try:
    result = confine_path(workspace, "new_file.py")
    expected = str(workspace / "new_file.py")
    tr("new_file", str(result) == expected, expected, str(result))
except Exception as e:
    tr("new_file", False, str(workspace / "new_file.py"), "", f"{type(e).__name__}: {e}")

# Test 5: Null byte in path
try:
    result = confine_path(workspace, "src\x00evil")
    tr("null_byte", False, "ValueError", str(result), "Should have raised ValueError")
except ValueError:
    tr("null_byte", True, "ValueError", "ValueError")
except Exception as e:
    tr("null_byte", False, "ValueError", type(e).__name__, f"Wrong exception: {e}")

# Test 6: Deep nested path within workspace
try:
    result = confine_path(workspace, "a/b/c/d.py")
    expected = str(workspace / "a" / "b" / "c" / "d.py")
    tr("deep_nested", str(result) == expected, expected, str(result))
except Exception as e:
    tr("deep_nested", False, str(workspace / "a" / "b" / "c" / "d.py"), "", f"{type(e).__name__}: {e}")

shutil.rmtree(tmpdir, ignore_errors=True)