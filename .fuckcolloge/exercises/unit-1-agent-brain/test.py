import json
import sys
sys.path.insert(0, '/tmp')
from solution import parse_llm_response, execute_action

results = []

# Test 1: parse clean JSON
try:
    result = parse_llm_response('{"action": "finish", "summary": "done"}')
    passed = isinstance(result, dict) and result.get("action") == "finish" and result.get("summary") == "done"
    results.append({"name": "parse clean JSON", "passed": passed, "expected": '{"action": "finish", "summary": "done"}', "actual": json.dumps(result, ensure_ascii=False)})
except Exception as e:
    results.append({"name": "parse clean JSON", "passed": False, "message": str(e), "expected": "finish dict", "actual": "exception"})

# Test 2: parse markdown-wrapped JSON with json tag
try:
    raw = '```json\n{"action": "write_code", "language": "python", "code": "print(1)"}\n```'
    result = parse_llm_response(raw)
    passed = isinstance(result, dict) and result.get("action") == "write_code" and result.get("code") == "print(1)" and result.get("language") == "python"
    results.append({"name": "parse markdown-wrapped JSON", "passed": passed, "expected": "action=write_code, code=print(1)", "actual": json.dumps(result, ensure_ascii=False)})
except Exception as e:
    results.append({"name": "parse markdown-wrapped JSON", "passed": False, "message": str(e), "expected": "write_code dict", "actual": "exception"})

# Test 3: parse markdown-wrapped JSON without lang tag
try:
    raw = '```\n{"action": "explain_concept", "explanation": "recursion"}\n```'
    result = parse_llm_response(raw)
    passed = isinstance(result, dict) and result.get("action") == "explain_concept" and result.get("explanation") == "recursion"
    results.append({"name": "parse markdown without lang tag", "passed": passed, "expected": "action=explain_concept, explanation=recursion", "actual": json.dumps(result, ensure_ascii=False)})
except Exception as e:
    results.append({"name": "parse markdown without lang tag", "passed": False, "message": str(e), "expected": "explain_concept dict", "actual": "exception"})

# Test 4: parse malformed JSON returns error dict
try:
    result = parse_llm_response('this is not json at all')
    passed = isinstance(result, dict) and result.get("action") == "error"
    results.append({"name": "parse malformed JSON returns error", "passed": passed, "expected": "action=error", "actual": json.dumps(result, ensure_ascii=False)})
except Exception as e:
    results.append({"name": "parse malformed JSON returns error", "passed": False, "message": str(e), "expected": "action=error", "actual": "exception"})

# Test 5: execute write_code action
try:
    action_dict = {"action": "write_code", "language": "python", "code": "print('hello')\nprint('world')"}
    result = execute_action(action_dict)
    passed = result == "已成功生成 python 代码，共 2 行。"
    results.append({"name": "execute write_code", "passed": passed, "expected": "已成功生成 python 代码，共 2 行。", "actual": str(result)})
except Exception as e:
    results.append({"name": "execute write_code", "passed": False, "message": str(e), "expected": "已成功生成 python 代码，共 2 行。", "actual": "exception"})

# Test 6: execute finish action
try:
    action_dict = {"action": "finish", "summary": "所有bug已修复"}
    result = execute_action(action_dict)
    passed = result == "任务完成：所有bug已修复"
    results.append({"name": "execute finish", "passed": passed, "expected": "任务完成：所有bug已修复", "actual": str(result)})
except Exception as e:
    results.append({"name": "execute finish", "passed": False, "message": str(e), "expected": "任务完成：所有bug已修复", "actual": "exception"})

# Test 7: execute explain_concept action
try:
    action_dict = {"action": "explain_concept", "explanation": "递归是函数调用自身"}
    result = execute_action(action_dict)
    passed = result == "概念解释：递归是函数调用自身"
    results.append({"name": "execute explain_concept", "passed": passed, "expected": "概念解释：递归是函数调用自身", "actual": str(result)})
except Exception as e:
    results.append({"name": "execute explain_concept", "passed": False, "message": str(e), "expected": "概念解释：递归是函数调用自身", "actual": "exception"})

# Test 8: execute unknown action
try:
    action_dict = {"action": "dance"}
    result = execute_action(action_dict)
    passed = result == "未知行动类型: dance"
    results.append({"name": "execute unknown action", "passed": passed, "expected": "未知行动类型: dance", "actual": str(result)})
except Exception as e:
    results.append({"name": "execute unknown action", "passed": False, "message": str(e), "expected": "未知行动类型: dance", "actual": "exception"})

for r in results:
    print(json.dumps(r, ensure_ascii=False))