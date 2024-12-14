// import { LitWrapper } from "@ai16z/lit-wrapper-sdk";

// const litWrapper = new LitWrapper("datil-dev")

// async function generateSolanaWallet() {
//     const response = await litWrapper.createSolanaWK(process.env.ETHEREUM_PRIVATE_KEY);
//     console.log("Solana Public Key", response.generatedPublicKey)

//     const signedTx = await litWrapper.sendSolanaWKTxnWithSol(
//         0.004 * Math.pow(10, 9), //0.004 Sol
//         "BTBPKRJQv7mn2kxBBJUpzh3wKN567ZLdXDWcxXFQ4KaV",
//         "mainnet-beta",
//         true,
//         ETHEREUM_PRIVATE_KEY,
//         wkRes,
//         pkpRes
//     );
//     console.log("Signed Transaction", txn)
// }
// generateSolanaWallet()

// async function senSolTxn() {
//     const signedTx = await litWrapper.sendSolanaWKTxnWithSol(
//         0.0022 * Math.pow(10, 9),
//         "BTBPKRJQv7mn2kxBBJUpzh3wKN567ZLdXDWcxXFQ4KaV",
//         "mainnet-beta",
//         true,
//         ETHEREUM_PRIVATE_KEY,
//         wkRes,
//         pkpRes
//     );
//     console.log("Signed Transaction", signedTx);
// }

// async function sendBONKTxn() {
//     const signedTx = await litWrapper.sendSolanaWKTxnWithBONK(
//         0.0022 * Math.pow(10, 5),
//         "BTBPKRJQv7mn2kxBBJUpzh3wKN567ZLdXDWcxXFQ4KaV",
//         "mainnet-beta",
//         true,
//         ETHEREUM_PRIVATE_KEY,
//         wkRes,
//         pkpRes
//     );
//     console.log("Signed Transaction", signedTx);
// }
