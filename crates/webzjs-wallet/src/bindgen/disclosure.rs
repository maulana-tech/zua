//! Payment disclosure for a single Orchard output.
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

use crate::disclosure::{disclose_action, verify_action};
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

/// For every Orchard action in `tx` that pays the account derived from
/// `seed_phrase`, returns `{ action, kEnc, value, memo }` as a JSON array.
/// The seed only lives for the duration of the call.
#[wasm_bindgen]
pub fn orchard_disclose(
    network: &str,
    seed_phrase: &str,
    account_hd_index: u32,
    tx: &[u8],
    height: u32,
) -> Result<String, JsValue> {
    let network = Network::from_str(network).map_err(err)?;
    let (usk, _) = usk_from_seed_str(seed_phrase, account_hd_index, &network).map_err(err)?;
    let ufvk = usk.to_unified_full_viewing_key();
    let fvk = ufvk.orchard().ok_or_else(|| err("account has no Orchard key"))?;
    let tx = read_tx(&network, tx, height)?;
    let bundle = tx
        .orchard_bundle()
        .ok_or_else(|| err("transaction has no Orchard actions"))?;

    let mut found = Vec::new();
    for (i, action) in bundle.actions().iter().enumerate() {
        if let Some(d) = disclose_action(fvk, action) {
            found.push(format!(
                "{{\"action\":{i},\"kEnc\":\"{}\",\"value\":\"{}\",\"memo\":{},\"internal\":{}}}",
                hex(&d.k_enc),
                d.value,
                json_str(&d.memo),
                d.internal
            ));
        }
    }
    Ok(format!("[{}]", found.join(",")))
}

/// Verifies a disclosure: decrypts action `action_index` of `tx` with `k_enc`,
/// rebuilds the note for `recipient_ua` and checks it against the on-chain
/// note commitment. Returns `{ value, memo }` as JSON, or an error.
#[wasm_bindgen]
pub fn orchard_verify_disclosure(
    network: &str,
    tx: &[u8],
    height: u32,
    action_index: u32,
    k_enc_hex: &str,
    recipient_ua: &str,
) -> Result<String, JsValue> {
    let network = Network::from_str(network).map_err(err)?;
    let tx = read_tx(&network, tx, height)?;
    let bundle = tx
        .orchard_bundle()
        .ok_or_else(|| err("transaction has no Orchard actions"))?;
    let action = bundle
        .actions()
        .get(action_index as usize)
        .ok_or_else(|| err("no such action in this transaction"))?;

    let ua = match zcash_keys::address::Address::decode(&network, recipient_ua) {
        Some(zcash_keys::address::Address::Unified(ua)) => ua,
        _ => return Err(err("recipient must be a unified address")),
    };
    let address = *ua
        .orchard()
        .ok_or_else(|| err("recipient has no Orchard receiver"))?;
    let (value, memo) = verify_action(action, &unhex32(k_enc_hex)?, &address).map_err(err)?;
    Ok(format!("{{\"value\":\"{value}\",\"memo\":{}}}", json_str(&memo)))
}
