//! Core of single-payment disclosure for Orchard-shaped pools: legacy Orchard
//! (note plaintext v2) and Ironwood (v3, NU6.3). See bindgen/disclosure.rs.

use chacha20poly1305::{aead::AeadInPlace, ChaCha20Poly1305, KeyInit};
use orchard::{
    keys::Scope,
    note::{ExtractedNoteCommitment, RandomSeed, Rho},
    note_encryption::{DomainVersion, NoteEncryptionDomain},
    value::NoteValue,
    Address, Note, NoteVersion,
};
use zcash_note_encryption::{try_note_decryption, Domain};
use zcash_protocol::memo::{Memo, MemoBytes};

const PLAINTEXT_LEN: usize = 52 + 512;

pub fn memo_text(memo: &[u8]) -> String {
    match MemoBytes::from_bytes(memo).ok().and_then(|m| Memo::try_from(m).ok()) {
        Some(Memo::Text(text)) => String::from(text),
        _ => String::new(),
    }
}

pub struct Disclosure {
    pub k_enc: [u8; 32],
    pub value: u64,
    pub memo: String,
    pub internal: bool,
}

/// Trial-decrypts `action` with the account's viewing key and, if it pays the
/// account, returns the note's symmetric key and contents.
pub fn disclose_action<V: DomainVersion, T>(
    fvk: &orchard::keys::FullViewingKey,
    action: &orchard::Action<T>,
) -> Option<Disclosure> {
    type D<V> = NoteEncryptionDomain<V>;
    for scope in [Scope::External, Scope::Internal] {
        let ivk = fvk.to_ivk(scope).prepare();
        let domain = D::<V>::for_action(action);
        let Some((note, _, memo)) = try_note_decryption(&domain, &ivk, action) else {
            continue;
        };
        let epk_bytes = zcash_note_encryption::EphemeralKeyBytes(action.encrypted_note().epk_bytes);
        let epk = D::<V>::epk(&epk_bytes)?;
        let shared = D::<V>::ka_agree_dec(&ivk, &D::<V>::prepare_epk(epk));
        let k_enc = D::<V>::kdf(shared, &epk_bytes);
        return Some(Disclosure {
            k_enc: k_enc.as_bytes().try_into().ok()?,
            value: note.value().inner(),
            memo: memo_text(memo.as_slice()),
            internal: scope == Scope::Internal,
        });
    }
    None
}

/// Decrypts `action` with a disclosed key and proves it pays `address`:
/// the AEAD authenticates the plaintext, and the rebuilt note must match the
/// action's on-chain commitment.
pub fn verify_action<V: DomainVersion, T>(
    action: &orchard::Action<T>,
    k_enc: &[u8; 32],
    address: &Address,
) -> Result<(u64, String), &'static str> {
    let enc = &action.encrypted_note().enc_ciphertext;
    let mut plaintext = [0u8; PLAINTEXT_LEN];
    plaintext.copy_from_slice(&enc[..PLAINTEXT_LEN]);
    ChaCha20Poly1305::new(k_enc.into())
        .decrypt_in_place_detached(
            (&[0u8; 12]).into(),
            &[],
            &mut plaintext,
            (&enc[PLAINTEXT_LEN..]).into(),
        )
        .map_err(|_| "the key does not decrypt this payment")?;
    let lead = match V::NOTE_VERSION {
        NoteVersion::V2 => 0x02,
        NoteVersion::V3 => 0x03,
    };
    if plaintext[0] != lead {
        return Err("unsupported note plaintext version");
    }
    if address.diversifier().as_array()[..] != plaintext[1..12] {
        return Err("this payment was sent to a different address");
    }
    let value = u64::from_le_bytes(plaintext[12..20].try_into().unwrap());
    let rseed_bytes: [u8; 32] = plaintext[20..52].try_into().unwrap();
    let rho: Rho = action.rho();
    let rseed = Option::from(RandomSeed::from_bytes(rseed_bytes, &rho)).ok_or("invalid rseed")?;
    let note: Note = Option::from(Note::from_parts(
        *address,
        NoteValue::from_raw(value),
        rho,
        rseed,
        V::NOTE_VERSION,
    ))
    .ok_or("invalid note")?;
    if ExtractedNoteCommitment::from(note.commitment()) != *action.cmx() {
        return Err("note commitment does not match the chain");
    }
    Ok((value, memo_text(&plaintext[52..])))
}

#[cfg(test)]
mod tests {
    use super::*;
    use orchard::{
        keys::{FullViewingKey, SpendAuthorizingKey, SpendValidatingKey, SpendingKey},
        note::{Nullifier, TransmittedNoteCiphertext},
        note_encryption::{
            IronwoodDomain, IronwoodNoteEncryption, IronwoodVersion, OrchardDomain,
            OrchardNoteEncryption, OrchardVersion,
        },
        primitives::redpallas::{SpendAuth, VerificationKey},
        value::ValueCommitment,
        Action,
    };
    use pasta_curves::{group::ff::Field, pallas};

    fn key(seed: u8) -> (SpendingKey, FullViewingKey) {
        let sk = SpendingKey::from_bytes([seed; 32]).unwrap();
        let fvk = FullViewingKey::from(&sk);
        (sk, fvk)
    }

    fn memo(text: &str) -> [u8; 512] {
        let mut m = [0u8; 512];
        m[..text.len()].copy_from_slice(text.as_bytes());
        m
    }

    /// A real action paying `value` with `memo_text` to `fvk`'s address, in
    /// the legacy Orchard (v2) or Ironwood (v3) note format.
    fn action_paying(
        sk: &SpendingKey,
        fvk: &FullViewingKey,
        value: u64,
        memo_text: &str,
        ironwood: bool,
    ) -> Action<()> {
        let address = fvk.address_at(0u32, Scope::External);
        let nf = Nullifier::from_bytes(&[0u8; 32]).unwrap();
        let rho = Rho::from_bytes(&nf.to_bytes()).unwrap();
        let rseed = (1u8..)
            .find_map(|b| Option::from(RandomSeed::from_bytes([b; 32], &rho)))
            .unwrap();
        let version = if ironwood { NoteVersion::V3 } else { NoteVersion::V2 };
        let note =
            Note::from_parts(address, NoteValue::from_raw(value), rho, rseed, version).unwrap();
        let encrypted = if ironwood {
            let enc = IronwoodNoteEncryption::new(None, note, memo(memo_text));
            TransmittedNoteCiphertext {
                epk_bytes: IronwoodDomain::epk_bytes(enc.epk()).0,
                enc_ciphertext: enc.encrypt_note_plaintext(),
                out_ciphertext: [0u8; 80],
            }
        } else {
            let enc = OrchardNoteEncryption::new(None, note, memo(memo_text));
            TransmittedNoteCiphertext {
                epk_bytes: OrchardDomain::epk_bytes(enc.epk()).0,
                enc_ciphertext: enc.encrypt_note_plaintext(),
                out_ciphertext: [0u8; 80],
            }
        };
        let rk: VerificationKey<SpendAuth> =
            SpendValidatingKey::from(&SpendAuthorizingKey::from(sk)).randomize(&pallas::Scalar::ONE);
        let cv_net = ValueCommitment::from_bytes(&<[u8; 32]>::from(&rk)).unwrap();
        Action::from_parts(nf, rk, note.commitment().into(), encrypted, cv_net, ()).unwrap()
    }

    fn round_trip<V: DomainVersion>(ironwood: bool) {
        let (sk, fvk) = key(7);
        let action = action_paying(&sk, &fvk, 80_000_000, "zua:inv:TEST000001", ironwood);
        let d = disclose_action::<V, _>(&fvk, &action).expect("owner can disclose");
        assert_eq!(d.value, 80_000_000);
        assert_eq!(d.memo, "zua:inv:TEST000001");
        let address = fvk.address_at(0u32, Scope::External);
        assert_eq!(
            verify_action::<V, _>(&action, &d.k_enc, &address),
            Ok((80_000_000, "zua:inv:TEST000001".to_string()))
        );
    }

    #[test]
    fn discloses_and_verifies_orchard_and_ironwood_payments() {
        round_trip::<OrchardVersion>(false);
        round_trip::<IronwoodVersion>(true);
    }

    #[test]
    fn rejects_wrong_key_wrong_address_wrong_pool_and_strangers() {
        let (sk, fvk) = key(7);
        let action = action_paying(&sk, &fvk, 5, "hi", true);
        let d = disclose_action::<IronwoodVersion, _>(&fvk, &action).unwrap();
        let address = fvk.address_at(0u32, Scope::External);

        let mut bad = d.k_enc;
        bad[0] ^= 1;
        assert!(verify_action::<IronwoodVersion, _>(&action, &bad, &address).is_err());
        // An Ironwood note can't pass as a legacy Orchard one.
        assert!(verify_action::<OrchardVersion, _>(&action, &d.k_enc, &address).is_err());
        assert!(disclose_action::<OrchardVersion, _>(&fvk, &action).is_none());

        let (_, other) = key(9);
        let other_address = other.address_at(0u32, Scope::External);
        assert!(verify_action::<IronwoodVersion, _>(&action, &d.k_enc, &other_address).is_err());
        assert!(disclose_action::<IronwoodVersion, _>(&other, &action).is_none());
    }
}
