import json


def agent_parse_and_validate(raw_response: str) -> dict:
    """Parse and validate an LLM response for the 铁甲钢拳 autonomous coding agent.

    The LLM returns a JSON string describing an action for the agent to perform.
    This function is the agent's "eyes" — it reads what the LLM "says" and checks
    whether the instructions are complete before executing them.

    In the final 铁甲钢拳 project, this function sits at the heart of the ReAct
    loop: Think → Act → Observe → Repeat. If parsing fails here, the entire loop
    breaks and the agent is paralyzed.

    Valid actions and their required fields:
        - "write_file": requires "filename" (str) and "code" (str)
        - "run_test":   requires "test_command" (str)
        - "finish":     no additional required fields

    Args:
        raw_response: A raw JSON string from the LLM, e.g.:
            '{"action": "write_file", "filename": "snake.py", "code": "print(1)"}'

    Returns:
        A dict with one of two structures:
        - On success: {"status": "success", "action": str, "payload": dict}
          where `payload` contains only the action-specific fields.
        - On error:   {"status": "error", "message": str}

    Examples:
        >>> agent_parse_and_validate('{"action": "write_file", "filename": "snake.py", "code": "print(1)"}')
        {'status': 'success', 'action': 'write_file', 'payload': {'filename': 'snake.py', 'code': 'print(1)'}}

        >>> agent_parse_and_validate('')
        {'status': 'error', 'message': 'Empty response from LLM'}

        >>> agent_parse_and_validate('{"action": "write_file", "filename": "snake.py"}')
        {'status': 'error', 'message': "Missing required field 'code' for action 'write_file'"}

        >>> agent_parse_and_validate('{"action": "finish"}')
        {'status': 'success', 'action': 'finish', 'payload': {}}
    """
    # TODO: Step 1 — Guard against empty or whitespace-only input.
    #       If raw_response is falsy or only whitespace (use .strip()),
    #       return {"status": "error", "message": "Empty response from LLM"}.

    # TODO: Step 2 — Parse the JSON string using json.loads().
    #       Wrap this in a try/except block to catch json.JSONDecodeError.
    #       On failure, return:
    #         {"status": "error", "message": "Failed to parse LLM response as JSON"}

    # TODO: Step 3 — Extract and validate the "action" field.
    #       If "action" key is missing from the parsed dict, return:
    #         {"status": "error", "message": "Missing required field: action"}
    #       If the action value is not one of {"write_file", "run_test", "finish"},
    #       return:
    #         {"status": "error", "message": f"Unknown action: {action}"}

    # TODO: Step 4 — Validate action-specific required fields.
    #       Define a mapping: action -> list of required field names.
    #         "write_file" needs ["filename", "code"]
    #         "run_test"   needs ["test_command"]
    #         "finish"     needs []
    #       For each required field, check if it exists in the parsed data.
    #       If any is missing, return:
    #         {"status": "error",
    #          "message": f"Missing required field '{field}' for action '{action}'"}

    # TODO: Step 5 — Build the success result.
    #       Create a payload dict containing ONLY the action-specific fields
    #       (copy them from the parsed data, not the entire parsed dict).
    #       Return:
    #         {"status": "success", "action": action, "payload": payload}

    pass