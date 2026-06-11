export function isValidParentheses(s: string): boolean {
  const stack: string[] = [];
  const pairs: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
  for (const ch of s) {
    if (ch === '(' || ch === '[' || ch === '{') {
      stack.push(ch);
    } else {
      const top = stack.pop();
      if (top !== pairs[ch]) {
        return false;
      }
    }
  }
  return stack.length === 0;
}
