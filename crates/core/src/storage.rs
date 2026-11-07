//! Storage providers: where the *bytes* of a linked file live.
//!
//! The DB only stores `(provider, uri)`. Adding Google Drive later means
//! implementing this trait (OAuth + Drive v3 `files.get?alt=media`), not
//! touching the library or UI.

use std::io::Read;
use std::path::Path;

use crate::models::Provider;
use crate::scan;
use crate::{Error, Result};

pub struct Stat {
    pub name: String,
    pub size: Option<i64>,
    pub mtime: Option<i64>,
}

pub trait StorageProvider: Send + Sync {
    fn id(&self) -> Provider;
    fn stat(&self, uri: &str) -> Result<Stat>;
    /// Streamed read (used by the server to serve media; desktop uses the asset protocol instead).
    fn open(&self, uri: &str) -> Result<Box<dyn Read + Send>>;
}

pub struct LocalProvider;

impl StorageProvider for LocalProvider {
    fn id(&self) -> Provider {
        Provider::Local
    }
    fn stat(&self, uri: &str) -> Result<Stat> {
        let p = Path::new(uri);
        let m = scan::stat(p)?;
        let name = p.file_name().and_then(|n| n.to_str()).unwrap_or(uri).to_string();
        Ok(Stat { name, size: m.size, mtime: m.mtime })
    }
    fn open(&self, uri: &str) -> Result<Box<dyn Read + Send>> {
        Ok(Box::new(std::fs::File::open(uri)?))
    }
}

/// Placeholder so the shape of the integration is visible. Not wired up yet.
pub struct GDriveProvider;

impl StorageProvider for GDriveProvider {
    fn id(&self) -> Provider {
        Provider::GDrive
    }
    fn stat(&self, _uri: &str) -> Result<Stat> {
        Err(Error::Unsupported("Google Drive provider not implemented yet".into()))
    }
    fn open(&self, _uri: &str) -> Result<Box<dyn Read + Send>> {
        Err(Error::Unsupported("Google Drive provider not implemented yet".into()))
    }
}

pub fn provider(p: Provider) -> Box<dyn StorageProvider> {
    match p {
        Provider::Local => Box::new(LocalProvider),
        Provider::GDrive | Provider::Http => Box::new(GDriveProvider),
    }
}
