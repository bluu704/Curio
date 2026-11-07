//! Product-code (품번) parsing and normalisation.

/// DLsite work ids: RJ / BJ / VJ / RE + 6 or 8 digits. Accepts URLs too.
pub fn dlsite_code(s: &str) -> Option<String> {
    // Byte-safe for any UTF-8 input (file names are often Korean/Japanese).
    let re = regex::Regex::new(r"(?i)(?:^|[^A-Za-z0-9])((?:RJ|BJ|VJ|RE)(\d{8}|\d{6}))(?:[^0-9]|$)").unwrap();
    re.captures(s).map(|c| c[1].to_ascii_uppercase())
}

/// Normalise a generic product code: `abc123` / `ABC 123` / `abc_00123` → `ABC-123`.
/// DLsite codes are kept as-is. Returns None when the text does not look like a code.
pub fn normalize(s: &str) -> Option<String> {
    if let Some(c) = dlsite_code(s) {
        return Some(c);
    }
    let t = s.trim();
    let letters: String = t.chars().take_while(|c| c.is_ascii_alphabetic()).collect();
    let rest = t[letters.len()..].trim_start_matches(['-', '_', ' ']);
    let digits: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
    let tail = &rest[digits.len()..];
    if letters.len() < 2 || letters.len() > 6 || digits.is_empty() || digits.len() > 6 || !tail.trim().is_empty() && !tail.starts_with(['-', '_']) {
        return None;
    }
    let n = digits.trim_start_matches('0');
    let n = if n.len() < 3 { format!("{:0>3}", n) } else { n.to_string() };
    Some(format!("{}-{}", letters.to_ascii_uppercase(), n))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn codes() {
        assert_eq!(dlsite_code("https://www.dlsite.com/maniax/work/=/product_id/RJ01014447.html").as_deref(), Some("RJ01014447"));
        assert_eq!(dlsite_code("rj123456").as_deref(), Some("RJ123456"));
        assert_eq!(dlsite_code("PRJ123456"), None);
        assert_eq!(normalize("abc123").as_deref(), Some("ABC-123"));
        assert_eq!(normalize("ABC_00045").as_deref(), Some("ABC-045"));
        assert_eq!(normalize("xyz-1001").as_deref(), Some("XYZ-1001"));
        assert_eq!(normalize("hello world"), None);
        assert_eq!(normalize("RJ01014447").as_deref(), Some("RJ01014447"));
        assert_eq!(dlsite_code("여름 끝의 편지"), None);
        assert_eq!(dlsite_code("[서클] 여름 RJ123456.zip").as_deref(), Some("RJ123456"));
        assert_eq!(normalize("여름 끝의 편지"), None);
    }
}
