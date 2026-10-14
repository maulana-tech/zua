use std::str::FromStr;

use nonempty::NonEmpty;
use serde::Serialize;
use wasm_bindgen::prelude::*;

use tonic_web_wasm_client::Client;

use crate::error::Error;
use crate::wallet::{open_db, usk_from_seed_str, Wallet};
use wasm_thread as thread;
use webzjs_common::Network;
use zcash_address::ZcashAddress;
use zcash_client_backend::data_api::WalletRead;
use zcash_client_backend::proto::service::ChainSpec;
use zcash_keys::keys::UnifiedAddressRequest;
use zcash_primitives::transaction::TxId;

pub use crate::wallet::NoteRef;

/// A Zcash wallet (NU6.3: Orchard and Ironwood) running in the browser.
///
/// ```javascript
/// const wallet = new WebWallet("main", "https://zcash-mainnet.chainsafe.dev", 3, 3, null);
/// const account = await wallet.create_account("main", seedPhrase, 0, birthday);
/// await wallet.sync();
/// ```
#[wasm_bindgen]
#[derive(Clone)]
pub struct WebWallet {
    inner: Wallet,
}

#[wasm_bindgen]
impl WebWallet {
    /// * `network` - "main" or "test"
    /// * `lightwalletd_url` - gRPC-web proxy for lightwalletd
    /// * `min_confirmations` - confirmations before received funds are spendable
    /// * `_min_confirmations_untrusted` - kept for API compatibility; the policy is symmetric
    /// * `db_bytes` - a database from `db_to_bytes` to restore, if any
    #[wasm_bindgen(constructor)]
    pub fn new(
        network: &str,
        lightwalletd_url: &str,
        min_confirmations: u32,
        _min_confirmations_untrusted: u32,
        db_bytes: Option<Box<[u8]>>,
    ) -> Result<WebWallet, Error> {
        let network = Network::from_str(network)?;
        let db = open_db(network, db_bytes.as_deref())?;
        Ok(Self {
            inner: Wallet::new(
                db,
                Client::new(lightwalletd_url.to_string()),
                network,
                min_confirmations,
            )?,
        })
    }

    /// Adds ZIP-32 account `account_hd_index` of the 24-word `seed_phrase`.
    /// Returns the account's position in this wallet.
    pub async fn create_account(
        &self,
        account_name: &str,
        seed_phrase: &str,
        account_hd_index: u32,
        birthday_height: Option<u32>,
    ) -> Result<u32, Error> {
        self.inner
            .create_account(account_name, seed_phrase, account_hd_index, birthday_height)
            .await
    }

    /// Downloads and scans blocks up to the chain tip on a worker thread.
    pub async fn sync(&self) -> Result<(), Error> {
        assert!(!thread::is_web_worker_thread());
        let wallet = self.inner.clone();
        let handle = thread::Builder::new()
            .name("sync".to_string())
            .spawn_async(|| async move { wallet.sync().await.map_err(|e| e.to_string()) })
            .unwrap_throw()
            .join_async();
        match handle.await {
            Ok(Ok(())) => Ok(()),
            Ok(Err(e)) => Err(Error::Sync(e)),
            Err(panic) => Err(Error::Sync(format!("Sync thread panicked: {panic:?}"))),
        }
    }

    pub async fn get_wallet_summary(&self) -> Result<Option<WalletSummary>, Error> {
        Ok(self.inner.get_wallet_summary().await?.map(|(s, ids)| {
            let mut account_balances: Vec<_> = s
                .account_balances()
                .iter()
                .filter_map(|(id, b)| {
                    let index = ids.iter().position(|x| x == id)? as u32;
                    Some((index, AccountBalance::from(b)))
                })
                .collect();
            account_balances.sort_by_key(|(i, _)| *i);
            WalletSummary {
                account_balances,
                chain_tip_height: s.chain_tip_height().into(),
                fully_scanned_height: s.fully_scanned_height().into(),
            }
        }))
    }

    /// Proposes a payment with an optional UTF-8 memo (shielded recipients only).
    pub async fn propose_transfer_with_memo(
        &self,
        account_id: u32,
        to_address: String,
        value: u64,
        memo: Option<String>,
    ) -> Result<super::proposal::Proposal, Error> {
        let to = ZcashAddress::try_from_encoded(&to_address)?;
        let memo = memo
            .map(|m| zcash_protocol::memo::Memo::from_str(&m).map(Into::into))
            .transpose()?;
        let proposal = self
            .inner
            .propose_transfer_with_memo(account_id, to, value, memo)
            .await?;
        Ok(proposal.into())
    }

    /// Proves (Halo 2, on worker threads) and signs the proposal. Returns the
    /// txids, 32 bytes each, concatenated.
    pub async fn create_proposed_transactions(
        &self,
        proposal: super::proposal::Proposal,
        seed_phrase: &str,
        account_hd_index: u32,
    ) -> Result<Vec<u8>, Error> {
        assert!(!thread::is_web_worker_thread());
        let usk = usk_from_seed_str(seed_phrase, account_hd_index, &self.inner.network)?;
        let wallet = self.inner.clone();
        let handle = thread::Builder::new()
            .name("create_proposed_transactions".to_string())
            .spawn_async(|| async move {
                wallet
                    .create_proposed_transactions(proposal.into(), &usk)
                    .await
                    .map_err(|e| e.to_string())
            })
            .unwrap_throw()
            .join_async();
        let txids = handle
            .await
            .map_err(|e| Error::Generic(format!("Proving thread panicked: {e:?}")))?
            .map_err(Error::Generic)?;
        Ok(txids.iter().flat_map(|t| *t.as_ref()).collect())
    }

    /// Broadcasts transactions created by `create_proposed_transactions`.
    pub async fn send_authorized_transactions(&self, txids: Vec<u8>) -> Result<(), Error> {
        let txids = txids
            .chunks(32)
            .map(|c| <[u8; 32]>::try_from(c).map(TxId::from_bytes).map_err(|_| Error::TxIdParse))
            .collect::<Result<Vec<_>, _>>()?;
        let txids = NonEmpty::from_vec(txids).ok_or(Error::TxIdParse)?;
        self.inner.send_authorized_transactions(&txids).await
    }

    /// Serialized SQLite database, to restore with the constructor.
    pub async fn db_to_bytes(&self) -> Result<Box<[u8]>, Error> {
        Ok(self.inner.db_to_bytes().await?.into_boxed_slice())
    }

    /// The account's current unified address (shielded receivers).
    pub async fn get_current_address(&self, account_id: u32) -> Result<String, Error> {
        let db = self.inner.db.lock().await;
        let uuid = Wallet::account_uuid(&db, account_id)?;
        let address = db
            .get_last_generated_address_matching(uuid, UnifiedAddressRequest::ALLOW_ALL)?
            .ok_or(Error::AccountNotFound(account_id))?;
        Ok(address.encode(&self.inner.network))
    }

    /// Newest-first transactions involving the account.
    pub async fn get_transaction_history(
        &self,
        account_id: u32,
        limit: Option<u32>,
        offset: Option<u32>,
    ) -> Result<JsValue, Error> {
        let db = self.inner.db.lock().await;
        let history = super::transaction_history::history(
            &db,
            account_id,
            limit.unwrap_or(50),
            offset.unwrap_or(0),
        )?;
        Ok(serde_wasm_bindgen::to_value(&history)?)
    }

    pub async fn get_latest_block(&self) -> Result<u64, Error> {
        Ok(self
            .inner
            .client
            .clone()
            .get_latest_block(ChainSpec {})
            .await?
            .into_inner()
            .height)
    }
}

#[derive(Debug, Serialize)]
#[wasm_bindgen(inspectable)]
pub struct WalletSummary {
    account_balances: Vec<(u32, AccountBalance)>,
    pub chain_tip_height: u32,
    pub fully_scanned_height: u32,
}

#[wasm_bindgen]
impl WalletSummary {
    #[wasm_bindgen(getter)]
    pub fn account_balances(&self) -> JsValue {
        serde_wasm_bindgen::to_value(&self.account_balances).unwrap_throw()
    }
}

/// Spendable balances in zatoshi. `orchard_balance` covers both Orchard-shaped
/// pools (legacy Orchard and Ironwood).
#[derive(Debug, Serialize)]
pub struct AccountBalance {
    pub sapling_balance: u64,
    pub orchard_balance: u64,
    pub ironwood_balance: u64,
    pub unshielded_balance: u64,
    pub pending_change: u64,
    pub pending_spendable: u64,
}

impl From<&zcash_client_backend::data_api::AccountBalance> for AccountBalance {
    fn from(b: &zcash_client_backend::data_api::AccountBalance) -> Self {
        let ironwood: u64 = b.ironwood_balance().spendable_value().into();
        let orchard: u64 = b.orchard_balance().spendable_value().into();
        AccountBalance {
            sapling_balance: b.sapling_balance().spendable_value().into(),
            orchard_balance: orchard + ironwood,
            ironwood_balance: ironwood,
            unshielded_balance: b.unshielded_balance().spendable_value().into(),
            pending_change: b.change_pending_confirmation().into(),
            pending_spendable: b.value_pending_spendability().into(),
        }
    }
}
