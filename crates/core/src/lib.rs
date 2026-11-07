//! Curio core: everything that is *not* UI or transport.
//!
//! Used by:
//!  - `src-tauri`     (desktop, IPC commands)
//!  - `crates/server` (REST API for web / self-hosting)
//!
//! Keep this crate free of Tauri/axum types so both hosts stay thin.

pub mod db;
pub mod drive;
pub mod error;
pub mod library;
pub mod media;
pub mod metadata;
pub mod models;
pub mod scan;
pub mod storage;

pub use error::{Error, Result};
pub use library::Library;
