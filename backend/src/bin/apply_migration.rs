//! One-off ops tool: executes a SQL migration file against `GROWTH_DATABASE_URL`.
//!
//!   cargo run --bin apply_migration -- migrations/0002_phase2_rag.sql [more files...]
//!
//! Used because this machine has no `psql` and the project is sqlx-native.
//! Deliberately NOT `sqlx::migrate!` — the earlier phases were applied by hand
//! in the Supabase SQL editor, so the `0001` baseline is already live and we
//! only push the deltas.

use std::path::PathBuf;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let _ = dotenvy::from_path(".env");
    let url = std::env::var("GROWTH_DATABASE_URL")
        .map_err(|_| "GROWTH_DATABASE_URL not set (expected in backend/.env)")?;

    let files: Vec<PathBuf> = std::env::args().skip(1).map(PathBuf::from).collect();
    if files.is_empty() {
        eprintln!("usage: apply_migration <file.sql> [more.sql...]");
        std::process::exit(2);
    }

    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(1)
        .connect(&url)
        .await?;

    for file in files {
        let name = file
            .file_name()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_default();
        print!("→ {name} … ");
        let sql = tokio::fs::read_to_string(&file).await?;
        sqlx::raw_sql(&sql).execute(&pool).await?;
        println!("OK");
    }

    pool.close().await;
    Ok(())
}
