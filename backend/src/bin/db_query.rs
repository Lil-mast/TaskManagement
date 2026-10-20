//! One-off ops tool: runs a SELECT against `GROWTH_DATABASE_URL` and prints
//! rows as TSV.   cargo run --bin db_query -- "select ..."

use sqlx::postgres::PgRow;
use sqlx::{Column as _, Row as _};

fn val(row: &PgRow, i: usize) -> String {
    let t = row.columns()[i].type_info().to_string();
    match t.as_str() {
        "INT2" => row.try_get::<i16, _>(i).unwrap().to_string(),
        "INT4" => row.try_get::<i32, _>(i).unwrap().to_string(),
        "INT8" => row.try_get::<i64, _>(i).unwrap().to_string(),
        "FLOAT4" => row.try_get::<f32, _>(i).unwrap().to_string(),
        "FLOAT8" => row.try_get::<f64, _>(i).unwrap().to_string(),
        "BOOL" => row.try_get::<bool, _>(i).unwrap().to_string(),
        "JSONB" | "JSON" => row
            .try_get::<serde_json::Value, _>(i)
            .unwrap_or(serde_json::Value::Null)
            .to_string(),
        _ => {
            if let Ok(o) = row.try_get::<Option<String>, _>(i) {
                o.unwrap_or_default()
            } else if let Ok(v) = row.try_get::<serde_json::Value, _>(i) {
                v.to_string()
            } else {
                "<unprintable>".into()
            }
        }
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let _ = dotenvy::from_path(".env");
    let url = std::env::var("GROWTH_DATABASE_URL").map_err(|_| "GROWTH_DATABASE_URL not set")?;
    let sql = std::env::args().skip(1).collect::<Vec<_>>().join(" ");
    if sql.is_empty() {
        eprintln!("usage: db_query \"<select>\"");
        std::process::exit(2);
    }

    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(1)
        .connect(&url)
        .await?;
    let rows = sqlx::query(&sql).fetch_all(&pool).await?;
    if rows.is_empty() {
        println!("(0 rows)");
        return Ok(());
    }
    let col_names = rows[0]
        .columns()
        .iter()
        .map(|c| c.name().to_string())
        .collect::<Vec<_>>();
    println!("{}", col_names.join("\t"));
    for row in rows {
        let vals: Vec<String> = (0..row.columns().len()).map(|i| val(&row, i)).collect();
        println!("{}", vals.join("\t"));
    }
    Ok(())
}
