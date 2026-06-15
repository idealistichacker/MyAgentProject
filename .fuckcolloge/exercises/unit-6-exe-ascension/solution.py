import sys

def generate_link_command(obj_path, exe_path, platform=None):
    """
    Generate the system linker command to produce an executable from an object file.

    This function encapsulates the platform-specific logic for linking,
    as described in the CS61A compiler pipeline. It prefers using 'cc' or 'gcc'
    over raw 'ld' to automatically include necessary runtime libraries.

    Parameters:
        obj_path (str): Path to the object file (e.g., 'hello.o').
        exe_path (str): Desired path for the final executable (e.g., 'hello' or 'hello.exe').
        platform (str, optional): Target platform identifier. If None, the current
            platform is detected via sys.platform. Accepted values: 'linux', 'darwin', 'win32'.

    Returns:
        list[str]: The linker command as a list of arguments, suitable for subprocess.run().

    Examples:
        >>> generate_link_command('hello.o', 'hello', 'linux')
        ['cc', 'hello.o', '-o', 'hello']
        >>> generate_link_command('hello.o', 'hello', 'darwin')
        ['cc', 'hello.o', '-o', 'hello']
        >>> generate_link_command('hello.o', 'hello.exe', 'win32')
        ['gcc', 'hello.o', '-o', 'hello.exe']
    """
    # Step 1: If platform is not provided, detect it using sys.platform
    # (sys.platform returns 'linux', 'darwin', or 'win32' on the respective OS)
    if platform is None:
        platform = sys.platform

    # Step 2: Based on the platform, choose the appropriate linker command
    # - For 'linux' and 'darwin': use 'cc' as the linker driver
    # - For 'win32': use 'gcc' (assuming MinGW environment)
    # TODO: Implement the platform logic and construct the command list
    # Hint: The command should be a list like ['cc', obj_path, '-o', exe_path]

    # Step 3: Return the command list
    pass