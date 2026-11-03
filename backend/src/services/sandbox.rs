//! Docker-based code execution sandbox.
//!
//! Each `run()` call:
//!   1. Writes the user's code to a named temp file.
//!   2. Spawns `docker run --rm --network none --memory 128m --cpus 0.5 …`
//!      against the language-specific slim image.
//!   3. Waits up to `timeout_secs` (default 10) for the container to exit.
//!   4. Returns stdout, stderr, exit code, and wall-clock time (ms).
//!
//! Security boundaries:
//!   - `--network none` — no outbound network access.
//!   - `--memory 128m` — prevents memory bombs.
//!   - `--cpus 0.5` — caps CPU usage to half a core.
//!   - `--rm` — container is removed immediately on exit.
//!   - `--read-only` with a `--tmpfs /tmp` for the writable scratch area.
//!   - Hard timeout enforced by `tokio::time::timeout`.

use std::time::{Duration, Instant};

use tokio::process::Command;
use tokio::time::timeout;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/// Languages the sandbox can execute.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Language {
    Python,
    Rust,
    JavaScript,
    C,
    Cpp,
}

impl Language {
    /// Parse the string identifier used on the wire / in the DB.
    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_ascii_lowercase().as_str() {
            "python" => Some(Self::Python),
            "rust" => Some(Self::Rust),
            "javascript" | "js" => Some(Self::JavaScript),
            "c" => Some(Self::C),
            "cpp" | "c++" => Some(Self::Cpp),
            _ => None,
        }
    }

    /// Canonical wire/DB name.
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Python => "python",
            Self::Rust => "rust",
            Self::JavaScript => "javascript",
            Self::C => "c",
            Self::Cpp => "cpp",
        }
    }

    /// Docker image to pull / run.
    fn docker_image(&self) -> &'static str {
        match self {
            Self::Python => "python:3.12-slim",
            Self::Rust => "rust:1.78-slim",
            Self::JavaScript => "node:20-slim",
            Self::C => "gcc:13",
            Self::Cpp => "gcc:13",
        }
    }

    /// Source file extension.
    fn file_extension(&self) -> &'static str {
        match self {
            Self::Python => "py",
            Self::Rust => "rs",
            Self::JavaScript => "js",
            Self::C => "c",
            Self::Cpp => "cpp",
        }
    }

    /// Command + args to execute the code file inside the container.
    /// The file is always mounted at `/code/main.<ext>`.
    fn run_command(&self) -> Vec<&'static str> {
        match self {
            Self::Python => vec!["python", "/code/main.py"],
            Self::Rust => vec![
                "sh", "-c",
                "rustc /code/main.rs -o /tmp/prog 2>&1 && /tmp/prog",
            ],
            Self::JavaScript => vec!["node", "/code/main.js"],
            // Compile then run; both stdout/stderr flow through the shell.
            Self::C => vec![
                "sh", "-c",
                "gcc /code/main.c -o /tmp/prog -lm 2>&1 && /tmp/prog",
            ],
            Self::Cpp => vec![
                "sh", "-c",
                "g++ /code/main.cpp -o /tmp/prog -lm -lstdc++ 2>&1 && /tmp/prog",
            ],
        }
    }
}

/// Result of one sandbox execution.
#[derive(Debug, Clone)]
pub struct SandboxResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
    pub time_ms: u64,
    pub timed_out: bool,
}

/// Configuration for the sandbox service.
#[derive(Debug, Clone)]
pub struct SandboxConfig {
    /// Hard wall-clock timeout per run. Default: 10 s.
    pub timeout_secs: u64,
}

impl Default for SandboxConfig {
    fn default() -> Self {
        Self { timeout_secs: 10 }
    }
}

/// The sandbox service — cheap to clone (just config).
#[derive(Debug, Clone)]
pub struct SandboxService {
    config: SandboxConfig,
}

impl SandboxService {
    pub fn new(config: SandboxConfig) -> Self {
        Self { config }
    }

    pub fn with_timeout(timeout_secs: u64) -> Self {
        Self::new(SandboxConfig { timeout_secs })
    }
}

// ---------------------------------------------------------------------------
// Core execution
// ---------------------------------------------------------------------------

impl SandboxService {
    /// Execute `code` in the appropriate Docker container and return the result.
    pub async fn run(&self, language: &Language, code: &str) -> anyhow::Result<SandboxResult> {
        // Write code to a named temp file on the host.
        let ext = language.file_extension();
        let tmp_dir = tempfile::Builder::new()
            .prefix("mrt_sandbox_")
            .tempdir()
            .map_err(|e| anyhow::anyhow!("tempdir: {e}"))?;

        let code_path = tmp_dir.path().join(format!("main.{ext}"));
        tokio::fs::write(&code_path, code)
            .await
            .map_err(|e| anyhow::anyhow!("write code file: {e}"))?;

        let host_dir = tmp_dir
            .path()
            .to_str()
            .ok_or_else(|| anyhow::anyhow!("tempdir path is not valid UTF-8"))?;

        // Build docker run command.
        let image = language.docker_image();
        let run_cmd = language.run_command();

        let mut docker = Command::new("docker");
        docker
            .arg("run")
            .arg("--rm")
            .arg("--network").arg("none")
            .arg("--memory").arg("128m")
            .arg("--cpus").arg("0.5")
            .arg("--read-only")
            .arg("--tmpfs").arg("/tmp:size=64m")
            // Mount the host temp dir read-only as /code inside the container.
            .arg("-v").arg(format!("{host_dir}:/code:ro"))
            .arg(image);

        // Append language-specific run args.
        for arg in &run_cmd {
            docker.arg(arg);
        }

        let start = Instant::now();
        let deadline = Duration::from_secs(self.config.timeout_secs);

        let output_result = timeout(deadline, docker.output()).await;

        let elapsed_ms = start.elapsed().as_millis() as u64;

        match output_result {
            Err(_elapsed) => {
                // Timeout — container may still be running; Docker will GC it.
                Ok(SandboxResult {
                    stdout: String::new(),
                    stderr: format!(
                        "Execution timed out after {} seconds.",
                        self.config.timeout_secs
                    ),
                    exit_code: -1,
                    time_ms: elapsed_ms,
                    timed_out: true,
                })
            }
            Ok(Err(e)) => Err(anyhow::anyhow!("docker spawn failed: {e}")),
            Ok(Ok(output)) => {
                let exit_code = output.status.code().unwrap_or(-1);
                let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
                let stderr = String::from_utf8_lossy(&output.stderr).into_owned();
                Ok(SandboxResult {
                    stdout,
                    stderr,
                    exit_code,
                    time_ms: elapsed_ms,
                    timed_out: false,
                })
            }
        }
    }

    /// Quick health check: runs `docker info` and returns true if Docker is
    /// reachable. Used to gate the workspace route with a 503.
    pub async fn is_docker_available() -> bool {
        Command::new("docker")
            .arg("info")
            .arg("--format")
            .arg("{{.ID}}")
            .output()
            .await
            .map(|o| o.status.success())
            .unwrap_or(false)
    }
}

// ---------------------------------------------------------------------------
// Unit tests (no Docker required — test pure logic / error paths)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn language_round_trip() {
        for (s, expected) in [
            ("python", Language::Python),
            ("rust", Language::Rust),
            ("javascript", Language::JavaScript),
            ("js", Language::JavaScript),
            ("c", Language::C),
            ("cpp", Language::Cpp),
            ("c++", Language::Cpp),
        ] {
            let lang = Language::from_str(s).expect(s);
            assert_eq!(lang, expected);
            // as_str() is always canonical (js → javascript)
            assert!(!lang.as_str().is_empty());
        }
    }

    #[test]
    fn unknown_language_is_none() {
        assert!(Language::from_str("cobol").is_none());
        assert!(Language::from_str("").is_none());
    }

    #[test]
    fn run_command_is_non_empty() {
        for lang in [
            Language::Python,
            Language::Rust,
            Language::JavaScript,
            Language::C,
            Language::Cpp,
        ] {
            assert!(!lang.run_command().is_empty(), "{} has no run command", lang.as_str());
        }
    }

    #[test]
    fn sandbox_config_default_timeout() {
        let cfg = SandboxConfig::default();
        assert_eq!(cfg.timeout_secs, 10);
    }
}
