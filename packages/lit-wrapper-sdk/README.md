## Lit Wrapper SDK

Using Lit has never been easier before

## Installation

```bash
npm install lit-wrapper-sdk
```

## Examples

### 1) Creating a Key on Solana and Sending Txn

Using Lit to create a Solana Key and Send a Txn with it, an Ethereum private key works as an auth method for generating signatures with a newly created Solana Key

```js
import { LitWrapper } from "lit-wrapper-sdk";
import "dotenv/config";

const litWrapper = new LitWrapper("datil-dev")

async function generateSolanaWallet() {
    const response = await litWrapper.createSolanaWK(process.env.ETHEREUM_PRIVATE_KEY);
    console.log("Solana Public Key", response.generatedPublicKey)
    
    const signedTx = await litWrapper.sendSolanaWKTxnWithSol(
        0.004 * Math.pow(10, 9), //0.004 Sol
        "BTBPKRJQv7mn2kxBBJUpzh3wKN567ZLdXDWcxXFQ4KaV",
        "mainnet-beta",
        true,
        ETHEREUM_PRIVATE_KEY,
        wkRes,
        pkpRes
    );
    console.log("Signed Transaction", txn)
}
generateSolanaWallet()
```

### 2) Creating a key on EVM and Executing a Lit Action

Create a key, Upload Lit Action to IPFS, Permit on IPFS and Execute the action

```js
import { LitWrapper } from "lit-wrapper-sdk";
import "dotenv/config";

const litWrapper = new LitWrapper("datil-dev");

async function createKeyAndExecuteAction() {
    const _litActionCode = async () => {
        try {
            const sigShare = await Lit.Actions.ethPersonalSignMessageEcdsa({
                message: dataToSign,
                publicKey: pkpPublicKey,
                sigName,
            });
            Lit.Actions.setResponse({ response: sigShare });
        } catch (error) {
            Lit.Actions.setResponse({ response: error.message });
        }
    };
    const litActionCode = `(${_litActionCode.toString()})();`;

    const { pkp, ipfsCID } = await litWrapper.createPKPWithLitAction(
        process.env.ETHEREUM_PRIVATE_KEY,
        litActionCode,
        process.env.PINATA_API_KEY
    );

    const params = {
        dataToSign: ethers.utils.arrayify(
            ethers.utils.keccak256([1, 2, 3, 4, 5])
        ),
        sigName: "sig1",
    }

    const response = litWrapper.executeLitAction(usePrivateKey, pkp, ipfsCID, params);
    console.log(response)
}

createKeyAndExecuteAction()
```

### 3) Testing a Lit Action

Instantly create a Lit Action and test its execution over Lit Network

```js
import { LitTester } from "lit-wrapper-sdk";
import * as ethers from "ethers";
import "dotenv/config";

const _litActionCode = async () => {
    try {
        const sigShare = await LitActions.ethPersonalSignMessageEcdsa({
            message: dataToSign,
            publicKey: pkpPublicKey,
            sigName,
        });
        Lit.Actions.setResponse({ response: sigShare });
    } catch (error) {
        Lit.Actions.setResponse({ response: error.message });
    }
};
const litActionCode = `(${_litActionCode.toString()})();`;

async function test() {
    if (!process.env.ETHEREUM_PRIVATE_KEY) {
        throw new Error("ETHEREUM_PRIVATE_KEY is not set");
    }
    const tester = await LitTester.init(
        process.env.ETHEREUM_PRIVATE_KEY,
        "datil-dev"
    );

    const params = [
        {
            dataToSign: ethers.utils.arrayify(
                ethers.utils.keccak256([1, 2, 3, 4, 5])
            ),
            sigName: "sig1",
        },
        {
            dataToSign: ethers.utils.arrayify(
                ethers.utils.keccak256([3, 3, 3, 3, 3])
            ),
            sigName: "sig2",
        }
    ];

    const result1 = await tester.testLitAction(litActionCode, params[0]);
    console.log("test result 1", result1);

    const result2 = await tester.testLitAction(litActionCode, params[1]);
    console.log("test result 2", result2);

    const result3 = await tester.testLitAction(litActionCode, params[2]);
    console.log("test result 3", result3);
}
test();
```
