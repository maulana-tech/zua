/* tslint:disable */
/* eslint-disable */
/**
 * The `ReadableStreamType` enum.
 *
 * *This API requires the following crate features to be activated: `ReadableStreamType`*
 */

export type ReadableStreamType = "bytes";

export class IntoUnderlyingByteSource {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    cancel(): void;
    pull(controller: ReadableByteStreamController): Promise<any>;
    start(controller: ReadableByteStreamController): void;
    readonly autoAllocateChunkSize: number;
    readonly type: ReadableStreamType;
}

export class IntoUnderlyingSink {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    abort(reason: any): Promise<any>;
    close(): Promise<any>;
    write(chunk: any): Promise<any>;
}

export class IntoUnderlyingSource {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    cancel(): void;
    pull(controller: ReadableStreamDefaultController): Promise<any>;
}

export class Pczt {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Deserialize to a Pczt from postcard bytes.
     */
    static from_bytes(bytes: Uint8Array): Pczt;
    /**
     * Returns the postcard serialization of the Pczt.
     */
    serialize(): Uint8Array;
}

/**
 * A handler to an immutable proposal. This can be passed to `create_proposed_transactions` to prove/authorize the transactions
 * before they are sent to the network.
 *
 * Review it with `fee_zat` and `send_zat` before proving.
 */
export class Proposal {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Total fee across all steps, in zatoshi.
     */
    fee_zat(): bigint;
    /**
     * Total paid to the requested recipients (excluding change), in zatoshi.
     * For a send-max proposal this is what the recipient receives.
     */
    send_zat(): bigint;
}

export class WalletSummary {
    private constructor();
    /**
     ** Return copy of self without private attributes.
     */
    toJSON(): Object;
    /**
     * Return stringified version of self.
     */
    toString(): string;
    free(): void;
    [Symbol.dispose](): void;
    chain_tip_height: number;
    fully_scanned_height: number;
    readonly account_balances: any;
}

/**
 * A Zcash wallet (NU6.3: Orchard and Ironwood) running in the browser.
 *
 * ```javascript
 * const wallet = new WebWallet("main", "https://zcash-mainnet.chainsafe.dev", 3, 3, null);
 * const account = await wallet.create_account("main", seedPhrase, 0, birthday);
 * await wallet.sync();
 * ```
 */
export class WebWallet {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Adds ZIP-32 account `account_hd_index` of the 24-word `seed_phrase`.
     * Returns the account's position in this wallet.
     */
    create_account(account_name: string, seed_phrase: string, account_hd_index: number, birthday_height?: number | null): Promise<number>;
    /**
     * Proves (Halo 2, on worker threads) and signs the proposal. Returns the
     * txids, 32 bytes each, concatenated.
     */
    create_proposed_transactions(proposal: Proposal, seed_phrase: string, account_hd_index: number): Promise<Uint8Array>;
    /**
     * Serialized SQLite database, to restore with the constructor.
     */
    db_to_bytes(): Promise<Uint8Array>;
    /**
     * The account's current unified address (shielded receivers).
     */
    get_current_address(account_id: number): Promise<string>;
    get_latest_block(): Promise<bigint>;
    /**
     * A fresh, unlinkable diversified address for the account.
     */
    get_next_address(account_id: number): Promise<string>;
    /**
     * Newest-first transactions involving the account.
     */
    get_transaction_history(account_id: number, limit?: number | null, offset?: number | null): Promise<any>;
    get_wallet_summary(): Promise<WalletSummary | undefined>;
    /**
     * * `network` - "main" or "test"
     * * `lightwalletd_url` - gRPC-web proxy for lightwalletd
     * * `min_confirmations` - confirmations before received funds are spendable
     * * `_min_confirmations_untrusted` - kept for API compatibility; the policy is symmetric
     * * `db_bytes` - a database from `db_to_bytes` to restore, if any
     */
    constructor(network: string, lightwalletd_url: string, min_confirmations: number, _min_confirmations_untrusted: number, db_bytes?: Uint8Array | null);
    /**
     * Proposes one transaction paying several recipients. `payments_json` is
     * `[{"to": "u1…", "zat": "100000", "memo": "…"}]` (memo optional).
     */
    propose_payments(account_id: number, payments_json: string): Promise<Proposal>;
    /**
     * Proposes sending everything spendable to `to_address` (fee deducted).
     */
    propose_send_max(account_id: number, to_address: string, memo?: string | null): Promise<Proposal>;
    /**
     * Proposes a payment with an optional UTF-8 memo (shielded recipients only).
     */
    propose_transfer_with_memo(account_id: number, to_address: string, value: bigint, memo?: string | null): Promise<Proposal>;
    /**
     * Broadcasts transactions created by `create_proposed_transactions`.
     */
    send_authorized_transactions(txids: Uint8Array): Promise<void>;
    /**
     * Downloads and scans blocks up to the chain tip on a worker thread.
     */
    sync(): Promise<void>;
}

export function initThreadPool(num_threads: number): Promise<any>;

/**
 * For every Orchard or Ironwood action in `tx` that pays the account derived
 * from `seed_phrase` (`direction: "received"`), or that the account sent to
 * someone else (`direction: "sent"`, recovered with its outgoing viewing key,
 * with the `recipient` UA), returns `{ direction, pool, action, kEnc, value,
 * memo, internal | recipient }` as a JSON array. The seed only lives for the
 * duration of the call.
 */
export function orchard_disclose(network: string, seed_phrase: string, account_hd_index: number, tx: Uint8Array, height: number): string;

/**
 * Verifies a disclosure: decrypts action `action_index` of the `pool`
 * ("orchard" or "ironwood") bundle of `tx` with `k_enc`, rebuilds the note
 * for `recipient_ua` and checks it against the on-chain note commitment.
 * Returns `{ value, memo }` as JSON, or an error.
 */
export function orchard_verify_disclosure(network: string, tx: Uint8Array, height: number, pool: string, action_index: number, k_enc_hex: string, recipient_ua: string): string;

export function start(): void;

/**
 * Entry point for web workers
 */
export function wasm_thread_entry_point(ptr: number): void;

export class wbg_rayon_PoolBuilder {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    build(): void;
    numThreads(): number;
    receiver(): number;
}

export function wbg_rayon_start_worker(receiver: number): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly __wbg_get_walletsummary_chain_tip_height: (a: number) => number;
    readonly __wbg_get_walletsummary_fully_scanned_height: (a: number) => number;
    readonly __wbg_intounderlyingbytesource_free: (a: number, b: number) => void;
    readonly __wbg_intounderlyingsink_free: (a: number, b: number) => void;
    readonly __wbg_intounderlyingsource_free: (a: number, b: number) => void;
    readonly __wbg_pczt_free: (a: number, b: number) => void;
    readonly __wbg_proposal_free: (a: number, b: number) => void;
    readonly __wbg_set_walletsummary_chain_tip_height: (a: number, b: number) => void;
    readonly __wbg_set_walletsummary_fully_scanned_height: (a: number, b: number) => void;
    readonly __wbg_walletsummary_free: (a: number, b: number) => void;
    readonly __wbg_wbg_rayon_poolbuilder_free: (a: number, b: number) => void;
    readonly __wbg_webwallet_free: (a: number, b: number) => void;
    readonly initThreadPool: (a: number) => any;
    readonly intounderlyingbytesource_autoAllocateChunkSize: (a: number) => number;
    readonly intounderlyingbytesource_cancel: (a: number) => void;
    readonly intounderlyingbytesource_pull: (a: number, b: any) => any;
    readonly intounderlyingbytesource_start: (a: number, b: any) => void;
    readonly intounderlyingbytesource_type: (a: number) => number;
    readonly intounderlyingsink_abort: (a: number, b: any) => any;
    readonly intounderlyingsink_close: (a: number) => any;
    readonly intounderlyingsink_write: (a: number, b: any) => any;
    readonly intounderlyingsource_cancel: (a: number) => void;
    readonly intounderlyingsource_pull: (a: number, b: any) => any;
    readonly orchard_disclose: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number, number];
    readonly orchard_verify_disclosure: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number) => [number, number, number, number];
    readonly pczt_from_bytes: (a: number, b: number) => number;
    readonly pczt_serialize: (a: number) => [number, number, number, number];
    readonly proposal_fee_zat: (a: number) => bigint;
    readonly proposal_send_zat: (a: number) => bigint;
    readonly start: () => void;
    readonly walletsummary_account_balances: (a: number) => any;
    readonly wasm_thread_entry_point: (a: number) => void;
    readonly wbg_rayon_poolbuilder_build: (a: number) => void;
    readonly wbg_rayon_poolbuilder_numThreads: (a: number) => number;
    readonly wbg_rayon_poolbuilder_receiver: (a: number) => number;
    readonly wbg_rayon_start_worker: (a: number) => void;
    readonly webwallet_create_account: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => any;
    readonly webwallet_create_proposed_transactions: (a: number, b: number, c: number, d: number, e: number) => any;
    readonly webwallet_db_to_bytes: (a: number) => any;
    readonly webwallet_get_current_address: (a: number, b: number) => any;
    readonly webwallet_get_latest_block: (a: number) => any;
    readonly webwallet_get_next_address: (a: number, b: number) => any;
    readonly webwallet_get_transaction_history: (a: number, b: number, c: number, d: number) => any;
    readonly webwallet_get_wallet_summary: (a: number) => any;
    readonly webwallet_new: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number];
    readonly webwallet_propose_payments: (a: number, b: number, c: number, d: number) => any;
    readonly webwallet_propose_send_max: (a: number, b: number, c: number, d: number, e: number, f: number) => any;
    readonly rust_sqlite_wasm_abort: () => void;
    readonly rust_sqlite_wasm_assert_fail: (a: number, b: number, c: number, d: number) => void;
    readonly rust_sqlite_wasm_calloc: (a: number, b: number) => number;
    readonly rust_sqlite_wasm_free: (a: number) => void;
    readonly rust_sqlite_wasm_getentropy: (a: number, b: number) => number;
    readonly rust_sqlite_wasm_localtime: (a: number) => number;
    readonly rust_sqlite_wasm_malloc: (a: number) => number;
    readonly rust_sqlite_wasm_realloc: (a: number, b: number) => number;
    readonly sqlite3_os_end: () => number;
    readonly sqlite3_os_init: () => number;
    readonly webwallet_propose_transfer_with_memo: (a: number, b: number, c: number, d: number, e: bigint, f: number, g: number) => any;
    readonly webwallet_send_authorized_transactions: (a: number, b: number, c: number) => any;
    readonly webwallet_sync: (a: number) => any;
    readonly rustsecp256k1_v0_14_default_error_callback_fn: (a: number, b: number) => void;
    readonly rustsecp256k1_v0_14_default_illegal_callback_fn: (a: number, b: number) => void;
    readonly rustsecp256k1_v0_14_context_create: (a: number) => number;
    readonly rustsecp256k1_v0_14_context_destroy: (a: number) => void;
    readonly wasm_bindgen_2d4164a0f0cf4d7b___convert__closures_____invoke___js_sys_5d4d6018ad607809___Function_fn_wasm_bindgen_2d4164a0f0cf4d7b___JsValue_____wasm_bindgen_2d4164a0f0cf4d7b___sys__Undefined___js_sys_5d4d6018ad607809___Function_fn_wasm_bindgen_2d4164a0f0cf4d7b___JsValue_____wasm_bindgen_2d4164a0f0cf4d7b___sys__Undefined_______true_: (a: number, b: number, c: any, d: any) => void;
    readonly wasm_bindgen_2d4164a0f0cf4d7b___convert__closures_____invoke___wasm_bindgen_2d4164a0f0cf4d7b___JsValue__core_fb28759eaf8b6199___result__Result_____wasm_bindgen_2d4164a0f0cf4d7b___JsError___true_: (a: number, b: number, c: any) => [number, number];
    readonly wasm_bindgen_2d4164a0f0cf4d7b___convert__closures________invoke___web_sys_f3154cf37e8da907___features__gen_MessageEvent__MessageEvent______true_: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen_2d4164a0f0cf4d7b___convert__closures________invoke___web_sys_f3154cf37e8da907___features__gen_MessageEvent__MessageEvent______true__47: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen_2d4164a0f0cf4d7b___convert__closures_____invoke___js_sys_5d4d6018ad607809___futures__task__wait_async_polyfill__MessageEvent______true_: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen_2d4164a0f0cf4d7b___convert__closures_____invoke___wasm_bindgen_2d4164a0f0cf4d7b___JsValue______true_: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen_2d4164a0f0cf4d7b___convert__closures_____invoke_______true_: (a: number, b: number) => void;
    readonly memory: WebAssembly.Memory;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_destroy_closure: (a: number, b: number) => void;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_thread_destroy: (a?: number, b?: number, c?: number) => void;
    readonly __wbindgen_start: (a: number) => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput, memory?: WebAssembly.Memory, thread_stack_size?: number }} module - Passing `SyncInitInput` directly is deprecated.
 * @param {WebAssembly.Memory} memory - Deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput, memory?: WebAssembly.Memory, thread_stack_size?: number } | SyncInitInput, memory?: WebAssembly.Memory): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput>, memory?: WebAssembly.Memory, thread_stack_size?: number }} module_or_path - Passing `InitInput` directly is deprecated.
 * @param {WebAssembly.Memory} memory - Deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput>, memory?: WebAssembly.Memory, thread_stack_size?: number } | InitInput | Promise<InitInput>, memory?: WebAssembly.Memory): Promise<InitOutput>;
