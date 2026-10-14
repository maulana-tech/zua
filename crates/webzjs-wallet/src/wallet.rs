//! A Zcash wallet backed by `zcash_client_sqlite` running on an in-memory
//! SQLite database (sqlite-wasm-rs in the browser). Tracks NU6.3: the
//! Ironwood pool is scanned and spent by the upstream backend.

use std::num::{NonZeroU32, NonZeroUsize};
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use bip0039::{English, Mnemonic};
use nonempty::NonEmpty;
use rand_chacha::rand_core::SeedableRng;
use rand_chacha::ChaCha20Rng;
use secrecy::{ExposeSecret, SecretVec, Zeroize};
use tokio::sync::Mutex;
use zcash_address::ZcashAddress;
use zcash_client_backend::data_api::wallet::input_selection::{GreedyInputSelector, SpendPolicy};
use zcash_client_backend::data_api::wallet::{
    create_proposed_transactions, propose_transfer, ConfirmationsPolicy, SpendingKeys,
};
use zcash_client_backend::data_api::{AccountBirthday, WalletRead, WalletSummary, WalletWrite};
use zcash_client_backend::fees::standard::MultiOutputChangeStrategy;
use zcash_client_backend::fees::{DustOutputPolicy, SplitPolicy, StandardFeeRule};
use zcash_client_backend::proposal::Proposal;
use zcash_client_backend::proto::service::{
    self, compact_tx_streamer_client::CompactTxStreamerClient,
};
use zcash_client_backend::sync::run;
use zcash_client_sqlite::util::Clock;

/// CSPRNG seeded from the browser (crypto.getRandomValues via getrandom).
fn os_seeded_rng() -> ChaCha20Rng {
    let mut seed = [0u8; 32];
    getrandom04::fill(&mut seed).expect("browser randomness");
    ChaCha20Rng::from_seed(seed)
}
use zcash_client_backend::wallet::OvkPolicy;
use zcash_client_backend::zip321::{Payment, TransactionRequest};
use zcash_client_sqlite::wallet::init::init_wallet_db;
use zcash_client_sqlite::{AccountUuid, ReceivedNoteId, WalletDb};
use zcash_keys::keys::UnifiedSpendingKey;
use zcash_primitives::transaction::TxId;
use zcash_proofs::prover::LocalTxProver;
use zcash_protocol::memo::MemoBytes;
use zcash_protocol::value::Zatoshis;
use zcash_protocol::ShieldedPool;

use crate::block_cache::MemBlockCache;
use crate::error::Error;
use webzjs_common::Network;

const BATCH_SIZE: u32 = 10000;

/// `SystemTime::now` panics on wasm32-unknown-unknown; read the JS clock instead.
#[derive(Clone, Copy)]
pub struct JsClock;

impl Clock for JsClock {
    fn now(&self) -> SystemTime {
        UNIX_EPOCH + Duration::from_millis(js_sys::Date::now() as u64)
    }
}

pub type Db = WalletDb<rusqlite::Connection, Network, JsClock, ChaCha20Rng>;
pub type NoteRef = ReceivedNoteId;
pub type WalletProposal = Proposal<StandardFeeRule, NoteRef>;
type Client = tonic_web_wasm_client::Client;

/// Opens the wallet database in memory, restoring `bytes` (from `db_to_bytes`)
/// when given, and runs schema migrations.
pub fn open_db(network: Network, bytes: Option<&[u8]>) -> Result<Db, Error> {
    let mut conn = rusqlite::Connection::open_in_memory()?;
    if let Some(bytes) = bytes {
        conn.deserialize_read_exact(rusqlite::MAIN_DB, bytes, bytes.len(), false)?;
    }
    rusqlite::vtab::array::load_module(&conn)?;
    let mut db = WalletDb::from_connection(conn, network, JsClock, os_seeded_rng());
    init_wallet_db(&mut db, None).map_err(|e| Error::Generic(format!("wallet db migration: {e}")))?;
    Ok(db)
}

#[derive(Clone)]
pub struct Wallet {
    pub(crate) db: Arc<Mutex<Db>>,
    pub(crate) client: CompactTxStreamerClient<Client>,
    pub(crate) network: Network,
    pub(crate) min_confirmations: ConfirmationsPolicy,
}

impl Wallet {
    pub fn new(db: Db, client: Client, network: Network, min_confirmations: u32) -> Result<Self, Error> {
        let min = NonZeroU32::new(min_confirmations).ok_or(Error::InvalidMinConformations)?;
        Ok(Wallet {
            db: Arc::new(Mutex::new(db)),
            client: CompactTxStreamerClient::new(client),
            network,
            min_confirmations: ConfirmationsPolicy::new_symmetrical(min),
        })
    }

    /// Wallet accounts are exposed to JS by their position (0, 1, ...).
    pub(crate) fn account_uuid(db: &Db, index: u32) -> Result<AccountUuid, Error> {
        db.get_account_ids()?
            .get(index as usize)
            .copied()
            .ok_or(Error::AccountNotFound(index))
    }

    pub(crate) fn account_index(db: &Db, uuid: AccountUuid) -> Result<u32, Error> {
        db.get_account_ids()?
            .iter()
            .position(|id| *id == uuid)
            .map(|i| i as u32)
            .ok_or(Error::Generic("unknown account".into()))
    }

    pub async fn db_to_bytes(&self) -> Result<Vec<u8>, Error> {
        let db = self.db.lock().await;
        Ok(db.conn().serialize(rusqlite::MAIN_DB)?.to_vec())
    }

    /// Adds the ZIP-32 account `account_hd_index` of `seed_phrase`. Notes
    /// before `birthday_height` are not scanned.
    pub async fn create_account(
        &self,
        account_name: &str,
        seed_phrase: &str,
        account_hd_index: u32,
        birthday_height: Option<u32>,
    ) -> Result<u32, Error> {
        let mut client = self.client.clone();
        let birthday = match birthday_height {
            Some(h) => h,
            None => {
                let tip = client
                    .get_latest_block(service::ChainSpec::default())
                    .await?
                    .into_inner()
                    .height;
                u32::try_from(tip).map_err(|_| Error::Birthday)? - 100
            }
        };
        // The birthday is the chain state as of the block before it. This
        // reveals the birthday (not the account) to the server.
        let treestate = client
            .get_tree_state(service::BlockId {
                height: u64::from(birthday - 1),
                ..Default::default()
            })
            .await?
            .into_inner();
        let birthday = AccountBirthday::from_treestate(treestate, None).map_err(|_| Error::Birthday)?;
        let seed = seed_from_phrase(seed_phrase)?;
        let mut db = self.db.lock().await;
        let (account, _) = db.import_account_hd(
            account_name,
            &seed,
            zip32::AccountId::try_from(account_hd_index)?,
            &birthday,
            None,
        )?;
        Self::account_index(&db, zcash_client_backend::data_api::Account::id(&account))
    }

    pub async fn sync(&self) -> Result<(), Error> {
        let mut client = self.client.clone();
        let cache = MemBlockCache::default();
        let mut db = self.db.lock().await;
        run(&mut client, &self.network, &cache, &mut *db, BATCH_SIZE)
            .await
            .map_err(Into::into)
    }

    pub async fn get_wallet_summary(&self) -> Result<Option<(WalletSummary<AccountUuid>, Vec<AccountUuid>)>, Error> {
        let db = self.db.lock().await;
        let ids = db.get_account_ids()?;
        Ok(db.get_wallet_summary(self.min_confirmations)?.map(|s| (s, ids)))
    }

    /// Proposes paying `value` zatoshi to `to_address`, with an optional memo
    /// for shielded recipients. Change goes back to the shielded pool
    /// (Ironwood after NU6.3).
    pub async fn propose_transfer_with_memo(
        &self,
        account_index: u32,
        to_address: ZcashAddress,
        value: u64,
        memo: Option<MemoBytes>,
    ) -> Result<WalletProposal, Error> {
        let payment = Payment::new(to_address, Some(Zatoshis::from_u64(value)?), memo, None, None, vec![])
            .map_err(|_| Error::UnsupportedMemoRecipient)?;
        let request = TransactionRequest::new(vec![payment])?;
        let change_strategy = MultiOutputChangeStrategy::new(
            StandardFeeRule::Zip317,
            None,
            ShieldedPool::Orchard,
            DustOutputPolicy::default(),
            SplitPolicy::with_min_output_value(
                NonZeroUsize::new(4).expect("nonzero"),
                Zatoshis::from_u64(10_000_000)?,
            ),
        );
        let mut db = self.db.lock().await;
        let account = Self::account_uuid(&db, account_index)?;
        propose_transfer::<_, _, _, _, <Db as zcash_client_backend::data_api::WalletCommitmentTrees>::Error>(
            &mut *db,
            &self.network,
            account,
            &GreedyInputSelector::new(),
            &change_strategy,
            request,
            self.min_confirmations,
            &SpendPolicy::default(),
            None,
            None,
        )
        .map_err(|e| Error::Generic(format!("Could not build the payment: {e}")))
    }

    /// Proves and signs the proposal; the transactions are stored in the
    /// wallet until `send_authorized_transactions` broadcasts them.
    pub async fn create_proposed_transactions(
        &self,
        proposal: WalletProposal,
        usk: &UnifiedSpendingKey,
    ) -> Result<NonEmpty<TxId>, Error> {
        let prover = LocalTxProver::bundled();
        let mut db = self.db.lock().await;
        create_proposed_transactions::<_, _, std::convert::Infallible, _, std::convert::Infallible, _>(
            &mut *db,
            &self.network,
            &JsClock,
            &mut os_seeded_rng(),
            &prover,
            &prover,
            &SpendingKeys::from_unified_spending_key(usk.clone()),
            OvkPolicy::Sender,
            &proposal,
            None,
        )
        .map_err(|e| Error::Generic(format!("Could not create the transaction: {e}")))
    }

    pub async fn send_authorized_transactions(&self, txids: &NonEmpty<TxId>) -> Result<(), Error> {
        let mut client = self.client.clone();
        for txid in txids.iter() {
            let raw = {
                let db = self.db.lock().await;
                let tx = db.get_transaction(*txid)?.ok_or(Error::TransactionNotFound(*txid))?;
                let mut raw = service::RawTransaction::default();
                tx.write(&mut raw.data)?;
                raw
            };
            let response = client.send_transaction(raw).await?.into_inner();
            if response.error_code != 0 {
                return Err(Error::SendFailed {
                    code: response.error_code,
                    reason: response.error_message,
                });
            }
        }
        Ok(())
    }
}

fn seed_from_phrase(phrase: &str) -> Result<SecretVec<u8>, Error> {
    let mnemonic = <Mnemonic<English>>::from_phrase(phrase).map_err(|_| Error::InvalidSeedPhrase)?;
    let mut seed = mnemonic.to_seed("");
    let secret = seed.to_vec();
    seed.zeroize();
    Ok(SecretVec::new(secret))
}

pub(crate) fn usk_from_seed_str(
    seed_phrase: &str,
    account_hd_index: u32,
    network: &Network,
) -> Result<UnifiedSpendingKey, Error> {
    let seed = seed_from_phrase(seed_phrase)?;
    Ok(UnifiedSpendingKey::from_seed(
        network,
        seed.expose_secret(),
        account_hd_index.try_into()?,
    )?)
}
