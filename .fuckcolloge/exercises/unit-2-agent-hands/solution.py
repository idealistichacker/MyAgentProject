from pathlib import Path


def confine_path(workspace: Path, user_path: str) -> Path:
    """
    Forge the Workspace Shield — the Agent's most critical security boundary.

    Before the Agent can read or write any file, every path from the LLM
    must pass through this function. It ensures no operation escapes the
    designated workspace, preventing path traversal attacks like
    ``../../.ssh/id_rsa`` from compromising the system.

    Security checks (performed in order):
      1. Reject null bytes — they can truncate paths at the C level,
         bypassing security checks in lower layers.
      2. Join ``user_path`` to ``workspace`` and resolve the result.
         ``resolve()`` expands ``..`` and follows symlinks, exposing
         the true destination of any path trickery.
      3. Verify the resolved path is still inside ``workspace`` using
         ``relative_to()``. If it isn't, raise ``PermissionError``.

    Args:
        workspace:  The root directory the Agent is allowed to operate in.
                    Must be an already-resolved absolute Path.
        user_path:  A relative or absolute path string provided by the LLM.
                    May point to a file that doesn't exist yet (for write_file).

    Returns:
        The resolved, verified Path object guaranteed to be within workspace.

    Raises:
        ValueError:      If ``user_path`` contains a null byte (``\\x00``).
        PermissionError: If the resolved path escapes the workspace boundary.

    Examples:
        >>> from pathlib import Path
        >>> ws = Path('/tmp/project')
        >>> confine_path(ws, 'src/main.py')
        PosixPath('/tmp/project/src/main.py')

        >>> confine_path(ws, '../../../etc/passwd')
        Traceback (most recent call last):
            ...
        PermissionError: path escapes workspace: /etc/passwd

        >>> confine_path(ws, 'src\\x00evil')
        Traceback (most recent call last):
            ...
        ValueError: null byte in path

        >>> confine_path(ws, 'new_file.py')  # file doesn't exist yet — OK
        PosixPath('/tmp/project/new_file.py')
    """
    # Step 1: Reject null bytes — they can truncate paths at the C level,
    #         bypassing security checks in lower layers.
    #         Check if '\x00' is in user_path. If so, raise ValueError
    #         with the message "null byte in path".
    if "\x00" in user_path:
        raise ValueError("null byte in path")

    # Step 2: Join user_path to workspace and resolve.
    #         Use (workspace / user_path).resolve(strict=False) to get the
    #         real path. strict=False allows paths to non-existent files
    #         (needed for write_file to create new files).
    candidate = (workspace / user_path).resolve(strict=False)

    # Step 3: Verify the candidate is within workspace.
    #         Try candidate.relative_to(workspace). If it raises ValueError,
    #         the path has escaped — raise PermissionError with a clear message
    #         like f"path escapes workspace: {candidate}".
    try:
        candidate.relative_to(workspace)
    except ValueError:
        raise PermissionError(f"path escapes workspace: {candidate}")

    # Step 4: Return the safe, resolved path.
    return candidate