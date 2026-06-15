/// Returns the longest word (contiguous non‑whitespace characters) in `s`.
///
/// If multiple words have the same maximum length, the first one is returned.
/// If the input is empty or contains only whitespace, an empty string slice is returned.
///
/// # Examples
///
/// /// let result = longest_word("hello world");
/// assert_eq!(result, "hello");
///
/// let result = longest_word("a bb ccc");
/// assert_eq!(result, "ccc");
///
/// let result = longest_word("   ");
/// assert_eq!(result, "");
/// ///
/// # Lifetimes
/// The returned reference is tied to the input `s`; no new allocation is performed.
pub fn longest_word<'a>(s: &'a str) -> &'a str {
    // Step 1: Split the string by whitespace to obtain an iterator over word slices.
    //         Use `s.split_whitespace()` which yields `&str` slices.
    let mut longest: &str = "";

    // Step 2: Iterate over each word slice.
    //         For each word, compare its byte length with the current longest.
    for word in s.split_whitespace() {
        // Step 3: If the current word is longer, update `longest`.
        if word.len() > longest.len() {
            longest = word;
        }
    }

    // Step 4: Return the longest word slice (or "" if no words were found).
    longest
}