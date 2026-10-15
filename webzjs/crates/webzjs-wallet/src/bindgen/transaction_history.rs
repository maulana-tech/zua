// Transaction history read straight from zcash_client_sqlite's views.

use rusqlite::{named_params, OptionalExtension};
use serde::Serialize;
use zcash_primitives::transaction::TxId;
use zcash_protocol::memo::{Memo, MemoBytes};

use crate::error::Error;
use crate::wallet::{Db, Wallet};

#[derive(Debug, Serialize)]
pub struct TransactionHistoryEntry {
    /// Display (explorer) order hex.
    txid: String,
    /// "Received", "Sent" or "Shielded".
    tx_type: &'static str,
    /// Net change for the account in zatoshi.
    value: i64,
    fee: Option<u64>,
    block_height: Option<u32>,
    confirmations: u32,
    /// "Confirmed", "Pending" or "Expired".
    status: &'static str,
    /// Text memos received in this transaction, newline separated.
    memo: Option<String>,
    /// Seconds since the Unix epoch.
    timestamp: Option<u64>,
    /// "transparent", "sapling", "orchard", "ironwood" or "mixed".
    pool: String,
}

#[derive(Debug, Serialize)]
pub struct TransactionHistoryResponse {
    transactions: Vec<TransactionHistoryEntry>,
}

fn pool_name(code: i64) -> &'static str {
    match code {
        0 => "transparent",
        2 => "sapling",
        3 => "orchard",
        _ => "ironwood",
    }
}

pub fn history(
    db: &Db,
    account_index: u32,
    limit: u32,
    offset: u32,
) -> Result<TransactionHistoryResponse, Error> {
    let account = Wallet::account_uuid(db, account_index)?.expose_uuid();
    let conn = db.conn();
    let tip: Option<u32> = conn
        .query_row("SELECT MAX(height) FROM blocks", [], |r| r.get(0))
        .optional()?
        .flatten();

    let mut rows = conn.prepare(
        "SELECT txid, mined_height, account_balance_delta, fee_paid, block_time,
                expired_unmined, is_shielding
         FROM v_transactions
         WHERE account_uuid = :account
         ORDER BY mined_height IS NOT NULL, mined_height DESC, tx_index DESC
         LIMIT :limit OFFSET :offset",
    )?;
    let mut outputs = conn.prepare(
        "SELECT output_pool, memo, to_account_uuid = :account AND NOT is_change
         FROM v_tx_outputs WHERE txid = :txid",
    )?;

    let mut transactions = Vec::new();
    let mut cursor = rows.query(named_params! {
        ":account": account,
        ":limit": limit,
        ":offset": offset,
    })?;
    while let Some(row) = cursor.next()? {
        let txid_bytes: Vec<u8> = row.get(0)?;
        let mined: Option<u32> = row.get(1)?;
        let delta: i64 = row.get(2)?;
        let fee: Option<u64> = row.get(3)?;
        let block_time: Option<u64> = row.get(4)?;
        let expired: Option<bool> = row.get(5)?;
        let shielding: bool = row.get(6)?;

        let mut pools = std::collections::BTreeSet::new();
        let mut memos = Vec::new();
        let mut out = outputs.query(named_params! { ":txid": txid_bytes, ":account": account })?;
        while let Some(o) = out.next()? {
            pools.insert(pool_name(o.get(0)?));
            let memo: Option<Vec<u8>> = o.get(1)?;
            let ours: Option<bool> = o.get(2)?;
            if ours == Some(true) {
                if let Some(Ok(Memo::Text(text))) = memo
                    .as_deref()
                    .and_then(|m| MemoBytes::from_bytes(m).ok())
                    .map(Memo::try_from)
                {
                    memos.push(String::from(text));
                }
            }
        }

        let txid = TxId::from_bytes(
            txid_bytes
                .as_slice()
                .try_into()
                .map_err(|_| Error::TxIdParse)?,
        );
        transactions.push(TransactionHistoryEntry {
            txid: txid.to_string(),
            tx_type: if shielding {
                "Shielded"
            } else if delta > 0 {
                "Received"
            } else {
                "Sent"
            },
            value: delta,
            fee,
            block_height: mined,
            confirmations: match (mined, tip) {
                (Some(h), Some(t)) if t >= h => t - h + 1,
                _ => 0,
            },
            status: if mined.is_some() {
                "Confirmed"
            } else if expired == Some(true) {
                "Expired"
            } else {
                "Pending"
            },
            memo: (!memos.is_empty()).then(|| memos.join("\n")),
            timestamp: block_time,
            pool: match pools.len() {
                1 => pools.into_iter().next().unwrap_or_default().to_string(),
                _ => "mixed".to_string(),
            },
        });
    }
    Ok(TransactionHistoryResponse { transactions })
}
