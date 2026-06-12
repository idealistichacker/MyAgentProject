import json
import sys
import copy

try:
    from solution import add
except ImportError as e:
    print(json.dumps({"name": "import-error", "passed": False, "message": str(e)}))
    sys.exit(1)

tests = json.loads('[{"name":"1+1","input":[1,1],"expected":2},{"name":"2+3","input":[2,3],"expected":5}]')
assertion_mode = 'return'
passed_count = 0

for test in tests:
    try:
        # Clone input to avoid mutation issues across tests
        cloned_input = copy.deepcopy(test['input'])
        actual_value = add(*cloned_input)
        
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
