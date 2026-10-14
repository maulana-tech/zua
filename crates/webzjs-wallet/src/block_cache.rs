//! In-memory compact block cache for `zcash_client_backend::sync::run`.
//!
//! Blocks only live between download and scan, so nothing is persisted.

use std::collections::BTreeMap;
use std::convert::Infallible;
use std::sync::Mutex;

use async_trait::async_trait;
use zcash_client_backend::data_api::chain::{error, BlockCache, BlockSource};
use zcash_client_backend::data_api::scanning::ScanRange;
use zcash_client_backend::proto::compact_formats::CompactBlock;
use zcash_protocol::consensus::BlockHeight;

#[derive(Default)]
pub struct MemBlockCache(Mutex<BTreeMap<u32, CompactBlock>>);

fn height(block: &CompactBlock) -> u32 {
    u32::try_from(block.height).expect("block heights fit in u32")
}

impl BlockSource for MemBlockCache {
    type Error = Infallible;

    fn with_blocks<F, WalletErrT>(
        &self,
        from_height: Option<BlockHeight>,
        limit: Option<usize>,
        mut with_block: F,
    ) -> Result<(), error::Error<WalletErrT, Self::Error>>
    where
        F: FnMut(CompactBlock) -> Result<(), error::Error<WalletErrT, Self::Error>>,
    {
        let from = from_height.map_or(0, u32::from);
        let blocks: Vec<CompactBlock> = self
            .0
            .lock()
            .unwrap()
            .range(from..)
            .take(limit.unwrap_or(usize::MAX))
            .map(|(_, b)| b.clone())
            .collect();
        for block in blocks {
            with_block(block)?;
        }
        Ok(())
    }
}

#[async_trait]
impl BlockCache for MemBlockCache {
    fn get_tip_height(&self, range: Option<&ScanRange>) -> Result<Option<BlockHeight>, Infallible> {
        let blocks = self.0.lock().unwrap();
        let tip = match range {
            Some(r) => blocks
                .range(u32::from(r.block_range().start)..u32::from(r.block_range().end))
                .next_back()
                .map(|(h, _)| *h),
            None => blocks.keys().next_back().copied(),
        };
        Ok(tip.map(BlockHeight::from_u32))
    }

    async fn read(&self, range: &ScanRange) -> Result<Vec<CompactBlock>, Infallible> {
        Ok(self
            .0
            .lock()
            .unwrap()
            .range(u32::from(range.block_range().start)..u32::from(range.block_range().end))
            .map(|(_, b)| b.clone())
            .collect())
    }

    async fn insert(&self, compact_blocks: Vec<CompactBlock>) -> Result<(), Infallible> {
        let mut blocks = self.0.lock().unwrap();
        for block in compact_blocks {
            blocks.insert(height(&block), block);
        }
        Ok(())
    }

    async fn delete(&self, range: ScanRange) -> Result<(), Infallible> {
        let r = u32::from(range.block_range().start)..u32::from(range.block_range().end);
        self.0.lock().unwrap().retain(|h, _| !r.contains(h));
        Ok(())
    }
}
