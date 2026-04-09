use serde::{Deserialize, Serialize};
use std::path::PathBuf;

const MAX_RECENT: usize = 10;

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct RecentFiles {
    paths: Vec<String>,
}

impl RecentFiles {
    pub fn add(&mut self, path: &str) {
        self.paths.retain(|p| p != path);
        self.paths.insert(0, path.to_string());
        self.paths.truncate(MAX_RECENT);
    }

    pub fn list(&self) -> &[String] {
        &self.paths
    }

    pub fn save(&self, dir: &PathBuf) -> Result<(), String> {
        let json = serde_json::to_string(self).map_err(|e| e.to_string())?;
        std::fs::write(dir.join("recent_files.json"), json).map_err(|e| e.to_string())
    }

    pub fn load(dir: &PathBuf) -> Self {
        std::fs::read_to_string(dir.join("recent_files.json"))
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn adds_to_front() {
        let mut rf = RecentFiles::default();
        rf.add("/a.md");
        rf.add("/b.md");
        assert_eq!(rf.list()[0], "/b.md");
    }

    #[test]
    fn deduplicates() {
        let mut rf = RecentFiles::default();
        rf.add("/a.md");
        rf.add("/b.md");
        rf.add("/a.md");
        assert_eq!(rf.list().len(), 2);
        assert_eq!(rf.list()[0], "/a.md");
    }

    #[test]
    fn caps_at_ten() {
        let mut rf = RecentFiles::default();
        for i in 0..15 {
            rf.add(&format!("/{i}.md"));
        }
        assert_eq!(rf.list().len(), 10);
    }

    #[test]
    fn persists_across_load() {
        let dir = tempdir().unwrap();
        let mut rf = RecentFiles::default();
        rf.add("/test.md");
        rf.save(&dir.path().to_path_buf()).unwrap();
        let loaded = RecentFiles::load(&dir.path().to_path_buf());
        assert_eq!(loaded.list()[0], "/test.md");
    }
}
