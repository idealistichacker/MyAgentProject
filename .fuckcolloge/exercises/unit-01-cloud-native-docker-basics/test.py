import json
import sys
import copy

try:
    from solution import run_layered_fs
except ImportError as e:
    print(json.dumps({"name": "import-error", "passed": False, "message": str(e)}))
    sys.exit(1)

tests = json.loads('[{"name":"基本读写","input":[[["init",[{"a.txt":"hello"},{"b.txt":"world"}]],["read","a.txt"],["write","a.txt","new hello"],["read","a.txt"],["read","b.txt"]]],"expected":[null,"hello",null,"new hello","world"]},{"name":"写时复制与下层不可变","input":[[["init",[{"a.txt":"base"}]],["read","a.txt"],["write","a.txt","modified"],["read","a.txt"],["inspect_base",0]]],"expected":[null,"base",null,"modified",{"a.txt":"base"}]},{"name":"删除文件","input":[[["init",[{"a.txt":"exists"}]],["read","a.txt"],["delete","a.txt"],["read","a.txt"]]],"expected":[null,"exists",null,null]},{"name":"创建新文件","input":[[["init",[]],["write","new.txt","data"],["read","new.txt"]]],"expected":[null,null,"data"]},{"name":"删除不存在的文件","input":[[["init",[]],["delete","nonexistent"],["read","nonexistent"]]],"expected":[null,null,null]},{"name":"多层读取优先级","input":[[["init",[{"a.txt":"layer1"},{"a.txt":"layer2"}]],["read","a.txt"]]],"expected":[null,"layer2"]}]')
assertion_mode = 'return'
passed_count = 0

for test in tests:
    try:
        # Clone input to avoid mutation issues across tests
        cloned_input = copy.deepcopy(test['input'])
        actual_value = run_layered_fs(*cloned_input)
        
        actual = actual_value
        if assertion_mode == 'mutate-and-return':
            actual = {"k": actual_value, "nums": cloned_input[0]}
            
        if actual == test['expected']:
            passed_count += 1
            print(json.dumps({"name": test['name'], "passed": True}))
        else:
            print(json.dumps({
                "name": test['name'],
                "passed": False,
                "message": "Assertion failed",
                "expected": test['expected'],
                "actual": actual
            }))
    except Exception as e:
        print(json.dumps({
            "name": test['name'],
            "passed": False,
            "message": str(e),
            "expected": test['expected'],
            "actual": None
        }))

if passed_count != len(tests):
    sys.exit(1)
