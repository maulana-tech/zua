//! Payment disclosure for a single Orchard or Ironwood output.
//!
//! The recipient reveals the note's symmetric encryption key `K_enc`
//! (= KDF^Orchard(KA.Agree(ivk, epk), epk), Zcash protocol spec §5.4.5.5).
//! That key decrypts exactly one action's ciphertext and reveals nothing about
//! the incoming viewing key. A verifier decrypts the ciphertext, rebuilds the
//! note from (recipient address, value, rho, rseed) and checks that its
//! commitment equals the action's `cmx` on chain, which proves the value,
//! recipient and memo of that one payment.

use std::str::FromStr;
use wasm_bindgen::prelude::*;
use webzjs_common::Network;
use zcash_primitives::transaction::Transaction;
use zcash_protocol::consensus::{BlockHeight, BranchId};

use crate::disclosure::{disclose_action, disclose_sent_action, verify_action};
use orchard::note_encryption::{IronwoodVersion, OrchardVersion};
use crate::wallet::usk_from_seed_str;

fn err(msg: impl std::fmt::Display) -> JsValue {
    JsValue::from_str(&msg.to_string())
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn unhex32(s: &str) -> Result<[u8; 32], JsValue> {
    if s.len() != 64 {
        return Err(err("expected 32 bytes of hex"));
    }
    let mut out = [0u8; 32];
    for (i, chunk) in s.as_bytes().chunks(2).enumerate() {
        let pair = std::str::from_utf8(chunk).map_err(err)?;
        out[i] = u8::from_str_radix(pair, 16).map_err(err)?;
    }
    Ok(out)
}

fn read_tx(network: &Network, tx: &[u8], height: u32) -> Result<Transaction, JsValue> {
    let branch = BranchId::for_height(network, BlockHeight::from_u32(height));
    Transaction::read(tx, branch).map_err(err)
}

fn json_str(s: &str) -> String {
    let mut out = String::from("\"");
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

/// For every Orchard or Ironwood action in `tx` that pays the account derived
/// from `seed_phrase` (`direction: "received"`), or that the account sent to
/// someone else (`direction: "sent"`, recovered with its outgoing viewing key,
/// with the `recipient` UA), returns `{ direction, pool, action, kEnc, value,
/// memo, internal | recipient }` as a JSON array. The seed only lives for the
/// duration of the call.
#[wasm_bindgen]
pub fn orchard_disclose(
    network: &str,
    seed_phrase: &str,
    account_hd_index: u32,
    tx: &[u8],
    height: u32,
) -> Result<String, JsValue> {
    let network = Network::from_str(network).map_err(err)?;
    let usk = usk_from_seed_str(seed_phrase, account_hd_index, &network).map_err(err)?;
    let ufvk = usk.to_unified_full_viewing_key();
    let fvk = ufvk.orchard().ok_or_else(|| err("account has no Orchard key"))?;
    let tx = read_tx(&network, tx, height)?;

    let mut found = Vec::new();
    let mut push = |pool: &str, i: usize, d: crate::disclosure::Disclosure| {
        found.push(format!(
            "{{\"direction\":\"received\",\"pool\":\"{pool}\",\"action\":{i},\"kEnc\":\"{}\",\"value\":\"{}\",\"memo\":{},\"internal\":{}}}",
            hex(&d.k_enc),
            d.value,
            json_str(&d.memo),
            d.internal
        ))
    };
    let mut sent = Vec::new();
    let mut push_sent = |pool: &str, i: usize, d: crate::disclosure::SentDisclosure| -> Result<(), JsValue> {
        let ua = zcash_keys::address::UnifiedAddress::from_receivers(Some(d.recipient), None, None, None, None)
            .ok_or_else(|| err("cannot encode recipient"))?
            .encode(&network);
        sent.push(format!(
            "{{\"direction\":\"sent\",\"pool\":\"{pool}\",\"action\":{i},\"kEnc\":\"{}\",\"value\":\"{}\",\"memo\":{},\"recipient\":\"{ua}\"}}",
            hex(&d.k_enc),
            d.value,
            json_str(&d.memo),
        ));
        Ok(())
    };
    if let Some(bundle) = tx.orchard_bundle() {
        for (i, action) in bundle.actions().iter().enumerate() {
            if let Some(d) = disclose_action::<OrchardVersion, _>(fvk, action) {
                push("orchard", i, d);
            } else if let Some(d) = disclose_sent_action::<OrchardVersion, _>(fvk, action) {
                push_sent("orchard", i, d)?;
            }
        }
    }
    if let Some(bundle) = tx.ironwood_bundle() {
        for (i, action) in bundle.actions().iter().enumerate() {
            if let Some(d) = disclose_action::<IronwoodVersion, _>(fvk, action) {
                push("ironwood", i, d);
            } else if let Some(d) = disclose_sent_action::<IronwoodVersion, _>(fvk, action) {
                push_sent("ironwood", i, d)?;
            }
        }
    }
    found.extend(sent);
    Ok(format!("[{}]", found.join(",")))
}

/// Verifies a disclosure: decrypts action `action_index` of the `pool`
/// ("orchard" or "ironwood") bundle of `tx` with `k_enc`, rebuilds the note
/// for `recipient_ua` and checks it against the on-chain note commitment.
/// Returns `{ value, memo }` as JSON, or an error.
#[wasm_bindgen]
pub fn orchard_verify_disclosure(
    network: &str,
    tx: &[u8],
    height: u32,
    pool: &str,
    action_index: u32,
    k_enc_hex: &str,
    recipient_ua: &str,
) -> Result<String, JsValue> {
    let network = Network::from_str(network).map_err(err)?;
    let tx = read_tx(&network, tx, height)?;
    let ua = match zcash_keys::address::Address::decode(&network, recipient_ua) {
        Some(zcash_keys::address::Address::Unified(ua)) => ua,
        _ => return Err(err("recipient must be a unified address")),
    };
    let address = *ua
        .orchard()
        .ok_or_else(|| err("recipient has no Orchard receiver"))?;
    let k_enc = unhex32(k_enc_hex)?;
    let (bundle, ironwood) = match pool {
        "orchard" => (tx.orchard_bundle(), false),
        "ironwood" => (tx.ironwood_bundle(), true),
        _ => return Err(err("pool must be orchard or ironwood")),
    };
    let action = bundle
        .ok_or_else(|| err("transaction has no actions in this pool"))?
        .actions()
        .get(action_index as usize)
        .ok_or_else(|| err("no such action in this transaction"))?;
    let (value, memo) = if ironwood {
        verify_action::<IronwoodVersion, _>(action, &k_enc, &address)
    } else {
        verify_action::<OrchardVersion, _>(action, &k_enc, &address)
    }
    .map_err(err)?;
    Ok(format!("{{\"value\":\"{value}\",\"memo\":{}}}", json_str(&memo)))
}
