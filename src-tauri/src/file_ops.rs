use std::fs;
use std::path::Path;

pub fn read_markdown_file(path: &str) -> Result<String, String> {
    let path = Path::new(path);
    if !path.exists() {
        return Err(format!("File not found: {}", path.display()));
    }
    if path.extension().and_then(|e| e.to_str()) != Some("md") {
        return Err("Only .md files are supported".to_string());
    }
    fs::read_to_string(path).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;

    #[test]
    fn reads_valid_md_file() {
        let mut tmp = NamedTempFile::with_suffix(".md").unwrap();
        write!(tmp, "# Hello\n\nWorld").unwrap();
        let content = read_markdown_file(tmp.path().to_str().unwrap()).unwrap();
        assert_eq!(content, "# Hello\n\nWorld");
    }

    #[test]
    fn errors_on_missing_file() {
        assert!(read_markdown_file("/nonexistent/path/file.md").is_err());
    }

    #[test]
    fn errors_on_non_md_file() {
        let tmp = NamedTempFile::with_suffix(".txt").unwrap();
        let result = read_markdown_file(tmp.path().to_str().unwrap());
        assert!(result.unwrap_err().contains("Only .md files"));
    }
}
