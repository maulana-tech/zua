use super::wallet::NoteRef;
use wasm_bindgen::prelude::*;
use zcash_client_backend::fees::StandardFeeRule;

/// A handler to an immutable proposal. This can be passed to `create_proposed_transactions` to prove/authorize the transactions
/// before they are sent to the network.
///
/// Review it with `fee_zat` and `send_zat` before proving.
#[wasm_bindgen]
pub struct Proposal {
    inner: zcash_client_backend::proposal::Proposal<StandardFeeRule, NoteRef>,
}

impl From<zcash_client_backend::proposal::Proposal<StandardFeeRule, NoteRef>> for Proposal {
    fn from(inner: zcash_client_backend::proposal::Proposal<StandardFeeRule, NoteRef>) -> Self {
        Self { inner }
    }
}

impl From<Proposal> for zcash_client_backend::proposal::Proposal<StandardFeeRule, NoteRef> {
    fn from(proposal: Proposal) -> Self {
        proposal.inner
    }
}

#[wasm_bindgen]
impl Proposal {
    /// Total fee across all steps, in zatoshi.
    pub fn fee_zat(&self) -> u64 {
        self.inner
            .steps()
            .iter()
            .map(|s| u64::from(s.balance().fee_required()))
            .sum()
    }

    /// Total paid to the requested recipients (excluding change), in zatoshi.
    /// For a send-max proposal this is what the recipient receives.
    pub fn send_zat(&self) -> u64 {
        self.inner
            .steps()
            .iter()
            .flat_map(|s| s.transaction_request().payments().values())
            .filter_map(|p| p.amount())
            .map(u64::from)
            .sum()
    }
}
