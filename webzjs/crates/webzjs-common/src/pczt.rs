use wasm_bindgen::prelude::*;

#[wasm_bindgen]
#[derive(Clone, Debug)]
pub struct Pczt(pczt::Pczt);

impl From<pczt::Pczt> for Pczt {
    fn from(pczt: pczt::Pczt) -> Self {
        Self(pczt)
    }
}

impl From<Pczt> for pczt::Pczt {
    fn from(pczt: Pczt) -> Self {
        pczt.0
    }
}

#[wasm_bindgen]
impl Pczt {
    /// Returns the postcard serialization of the Pczt.
    pub fn serialize(&self) -> Result<Vec<u8>, JsError> {
        self.0.clone().serialize().map_err(|e| JsError::new(&format!("{e:?}")))
    }

    /// Deserialize to a Pczt from postcard bytes.
    pub fn from_bytes(bytes: &[u8]) -> Pczt {
        Self(pczt::Pczt::parse(bytes).unwrap())
    }
}
