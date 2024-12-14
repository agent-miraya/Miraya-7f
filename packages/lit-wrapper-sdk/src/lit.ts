import { LitNodeClient } from "@lit-protocol/lit-node-client";
import {
    LIT_ABILITY,
    LIT_RPC,
    AUTH_METHOD_SCOPE,
} from "@lit-protocol/constants";
import { LitActionResource, LitPKPResource } from "@lit-protocol/auth-helpers";
import { LitContracts } from "@lit-protocol/contracts-sdk";
import { EthWalletProvider } from "@lit-protocol/lit-auth-client";
import { LIT_NETWORKS_KEYS } from "@lit-protocol/types";
import * as ethers from "ethers";
import bs58 from "bs58";
import {
    Connection,
    LAMPORTS_PER_SOL,
    PublicKey,
    SystemProgram,
    Transaction,
    clusterApiUrl,
    Cluster
} from "@solana/web3.js";
import { api } from "@lit-protocol/wrapped-keys";
const { generatePrivateKey, signTransactionWithEncryptedKey } = api;
import {
    getAssociatedTokenAddress,
    createAssociatedTokenAccountInstruction,
    createTransferInstruction,
} from "@solana/spl-token";

interface PKP {
    tokenId: string;
    publicKey: string;
    ethAddress: string;
}

interface WK {
    pkpAddress: string;
    id: string;
    generatedPublicKey: string;
}

class LitWrapper {
    public litNetwork: LIT_NETWORKS_KEYS;
    public pkp: PKP | null;

    constructor(litNetwork: LIT_NETWORKS_KEYS) {
        this.litNetwork = litNetwork;
        this.pkp = null;
    }

    async createPKP(userPrivateKey: string) {
        try {
            const ethersWallet = new ethers.Wallet(
                userPrivateKey,
                new ethers.providers.JsonRpcProvider(
                    LIT_RPC.CHRONICLE_YELLOWSTONE
                )
            );

            const litContracts = new LitContracts({
                signer: ethersWallet,
                network: this.litNetwork,
                debug: false,
            });
            await litContracts.connect();

            const pkp = (await litContracts.pkpNftContractUtils.write.mint())
                .pkp;
            console.log("PKP: ", pkp);
            this.pkp = pkp;
            return pkp;
        } catch (error) {
            console.error(error);
        }
    }

    async addPermittedAction(
        userPrivateKey: string,
        pkpTokenId: string,
        litActionCode: string,
        pinataAPI: string
    ) {
        const ipfsCID = await this.uploadViaPinata(pinataAPI, litActionCode);

        const ethersWallet = new ethers.Wallet(
            userPrivateKey,
            new ethers.providers.JsonRpcProvider(LIT_RPC.CHRONICLE_YELLOWSTONE)
        );

        const litContracts = new LitContracts({
            signer: ethersWallet,
            network: this.litNetwork,
            debug: false,
        });
        await litContracts.connect();

        await litContracts.addPermittedAction({
            pkpTokenId: pkpTokenId,
            ipfsId: ipfsCID,
            authMethodScopes: [AUTH_METHOD_SCOPE.SignAnything],
        });

        return ipfsCID;
    }

    async uploadViaPinata(pinataAPI: string, litActionCode: string) {
        const formData = new FormData();

        const file = new File([litActionCode], "Action.txt", {
            type: "text/plain",
        });
        const pinataMetadata = JSON.stringify({
            name: "EVM-SWAP",
        });
        const pinataOptions = JSON.stringify({
            cidVersion: 0,
        });

        formData.append("file", file);
        formData.append("pinataMetadata", pinataMetadata);
        formData.append("pinataOptions", pinataOptions);

        const request = await fetch(
            "https://api.pinata.cloud/pinning/pinFileToIPFS",
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${pinataAPI}`,
                },
                body: formData,
            }
        );
        const response = await request.json();
        console.log(response);
        return response.IpfsHash;
    }

    async checkPermits(pkpTokenId: string, litActionCID: string) {
        console.log("checking perms..");

        const litContracts = new LitContracts({
            network: this.litNetwork,
            debug: false,
        });
        await litContracts.connect();

        let CIDinHex = `0x${Buffer.from(bs58.decode(litActionCID)).toString(
            "hex"
        )}`;
        let permittedActions =
            await litContracts.pkpPermissionsContract.read.getPermittedActions(
                pkpTokenId
            );
        let permittedAuthMethods =
            await litContracts.pkpPermissionsContract.read.getPermittedAuthMethods(
                pkpTokenId
            );
        let permittedAddresses =
            await litContracts.pkpPermissionsContract.read.getPermittedAddresses(
                pkpTokenId
            );

        const results = {
            litAction: {
                cid: litActionCID,
                hex: CIDinHex,
            },
            permissions: {
                actions: permittedActions,
                authMethods: permittedAuthMethods,
                addresses: permittedAddresses,
            },
        };
        console.log(results);
        return results;
    }

    async createPKPWithLitAction(
        userPrivateKey: string,
        litActionCode: string,
        pinataAPI: string
    ) {
        await this.createPKP(userPrivateKey);
        if (!this.pkp) {
            throw new Error("PKP not initialized");
        }

        const ipfsCID = this.addPermittedAction(
            userPrivateKey,
            this.pkp.tokenId,
            litActionCode,
            pinataAPI
        );
        let pkp = this.pkp;
        return { pkp, ipfsCID };
    }

    async executeLitAction(
        userPrivateKey: string,
        pkpPublicKey: string,
        litActionCID: string,
        params: Object
    ) {
        const litNodeClient = new LitNodeClient({
            litNetwork: this.litNetwork,
            debug: false,
        });
        try {
            await litNodeClient.connect();

            const ethersWallet = new ethers.Wallet(
                userPrivateKey,
                new ethers.providers.JsonRpcProvider(
                    LIT_RPC.CHRONICLE_YELLOWSTONE
                )
            );

            const authMethod = await EthWalletProvider.authenticate({
                signer: ethersWallet,
                litNodeClient,
            });
            const pkpSessionSigs = await litNodeClient.getPkpSessionSigs({
                pkpPublicKey: pkpPublicKey,
                chain: "ethereum",
                authMethods: [authMethod],
                resourceAbilityRequests: [
                    {
                        resource: new LitActionResource("*"),
                        ability: LIT_ABILITY.LitActionExecution,
                    },
                    {
                        resource: new LitPKPResource("*"),
                        ability: LIT_ABILITY.PKPSigning,
                    },
                ],
            });

            const result = await litNodeClient.executeJs({
                sessionSigs: pkpSessionSigs,
                ipfsId: litActionCID,
                jsParams: { publicKey: pkpPublicKey, ...params },
            });

            console.log(result);
            return result;
        } catch (error) {
            console.error(error);
        } finally {
            litNodeClient?.disconnect();
        }
    }

    async createSolanaWK(userPrivateKey: string) {
        const litNodeClient = new LitNodeClient({
            litNetwork: this.litNetwork,
            debug: false,
        });
        try {
            await this.createPKP(userPrivateKey);

            if (!this.pkp) {
                throw new Error("PKP not initialized");
            }

            const ethersWallet = new ethers.Wallet(
                userPrivateKey,
                new ethers.providers.JsonRpcProvider(
                    LIT_RPC.CHRONICLE_YELLOWSTONE
                )
            );
            const authMethod = await EthWalletProvider.authenticate({
                signer: ethersWallet,
                litNodeClient,
            });

            await litNodeClient.connect();

            const pkpSessionSigs = await litNodeClient.getPkpSessionSigs({
                pkpPublicKey: this.pkp.publicKey,
                chain: "ethereum",
                authMethods: [authMethod],
                resourceAbilityRequests: [
                    {
                        resource: new LitActionResource("*"),
                        ability: LIT_ABILITY.LitActionExecution,
                    },
                    {
                        resource: new LitPKPResource("*"),
                        ability: LIT_ABILITY.PKPSigning,
                    },
                ],
                expiration: new Date(Date.now() + 1000 * 60 * 10).toISOString(), // 10 minutes
            });

            const wrappedKeyInfo = await generatePrivateKey({
                pkpSessionSigs,
                network: "solana",
                memo: "This is a test memo",
                litNodeClient,
            });

            if (!wrappedKeyInfo) {
                throw new Error("Failed to generate wrapped key");
            }

            console.log("WK: ", wrappedKeyInfo);
            return wrappedKeyInfo as WK;
        } catch (error) {
            console.error;
        } finally {
            litNodeClient?.disconnect();
        }
    }

    async sendSolanaWKTxnWithSol(
        amount: number,
        toAddress: string,
        network: Cluster,
        broadcastTransaction: boolean,
        userPrivateKey: string,
        wkResponse: WK,
        pkp?: PKP
    ) {
        if (pkp) {
            this.pkp = pkp;
        }
        if (!this.pkp) {
            throw new Error("PKP not initialized");
        }

        const litNodeClient = new LitNodeClient({
            litNetwork: this.litNetwork,
            debug: false,
        });
        try {
            const generatedSolanaPublicKey = new PublicKey(
                wkResponse.generatedPublicKey
            );

            const receiverPublicKey = new PublicKey(toAddress);

            const solanaTransaction = new Transaction();
            solanaTransaction.add(
                SystemProgram.transfer({
                    fromPubkey: generatedSolanaPublicKey,
                    toPubkey: receiverPublicKey,
                    lamports: amount,
                })
            );
            solanaTransaction.feePayer = generatedSolanaPublicKey;

            const solanaConnection = new Connection(
                clusterApiUrl(network),
                "confirmed"
            );
            const { blockhash } = await solanaConnection.getLatestBlockhash();
            solanaTransaction.recentBlockhash = blockhash;

            const serializedTransaction = solanaTransaction
                .serialize({
                    requireAllSignatures: false, // should be false as we're not signing the message
                    verifySignatures: false, // should be false as we're not signing the message
                })
                .toString("base64");

            const litTransaction = {
                serializedTransaction,
                chain: network,
            };

            await litNodeClient.connect();
            const ethersWallet = new ethers.Wallet(
                userPrivateKey,
                new ethers.providers.JsonRpcProvider(
                    LIT_RPC.CHRONICLE_YELLOWSTONE
                )
            );
            const authMethod = await EthWalletProvider.authenticate({
                signer: ethersWallet,
                litNodeClient,
            });

            const pkpSessionSigs = await litNodeClient.getPkpSessionSigs({
                pkpPublicKey: this.pkp.publicKey,
                chain: "ethereum",
                authMethods: [authMethod],
                resourceAbilityRequests: [
                    {
                        resource: new LitActionResource("*"),
                        ability: LIT_ABILITY.LitActionExecution,
                    },
                    {
                        resource: new LitPKPResource("*"),
                        ability: LIT_ABILITY.PKPSigning,
                    },
                ],
                expiration: new Date(Date.now() + 1000 * 60 * 10).toISOString(), // 10 minutes
            });

            const signedTransaction = await signTransactionWithEncryptedKey({
                pkpSessionSigs,
                network: "solana",
                id: wkResponse.id,
                unsignedTransaction: litTransaction,
                broadcast: broadcastTransaction,
                litNodeClient,
            });
            return signedTransaction;
        } catch (error) {
            console.error(error);
        } finally {
            litNodeClient?.disconnect();
        }
    }
    async sendSolanaWKTxnWithBONK(
        amount: number,
        toAddress: string,
        network: Cluster,
        broadcastTransaction: boolean,
        userPrivateKey: string,
        wkResponse: WK,
        pkp?: PKP
    ) {
        if (pkp) {
            this.pkp = pkp;
        }
        if (!this.pkp) {
            throw new Error("PKP not initialized");
        }

        const litNodeClient = new LitNodeClient({
            litNetwork: this.litNetwork,
            debug: false,
        });
        try {
            const generatedSolanaPublicKey = new PublicKey(
                wkResponse.generatedPublicKey
            );
            console.log("Sending from address: ", generatedSolanaPublicKey.toString());

            const receiverPublicKey = new PublicKey(toAddress);

            const BONK_TOKEN_MINT =
                "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"; // BONK token mint address
            const tokenAccount = await getAssociatedTokenAddress(
                new PublicKey(BONK_TOKEN_MINT),
                generatedSolanaPublicKey
            );

            const destinationAccount = await getAssociatedTokenAddress(
                new PublicKey(BONK_TOKEN_MINT),
                receiverPublicKey
            );

            const transaction = new Transaction();

            const connection = new Connection(
                clusterApiUrl(network),
                "confirmed"
            );

            // Check if destination token account exists
            const destinationAccountInfo = await connection.getAccountInfo(
                destinationAccount
            );
            if (!destinationAccountInfo) {
                transaction.add(
                    createAssociatedTokenAccountInstruction(
                        generatedSolanaPublicKey,
                        destinationAccount,
                        receiverPublicKey,
                        new PublicKey(BONK_TOKEN_MINT)
                    )
                );
            }

            // Add transfer instruction
            transaction.add(
                createTransferInstruction(
                    tokenAccount,
                    destinationAccount,
                    generatedSolanaPublicKey,
                    amount
                )
            );

            transaction.feePayer = generatedSolanaPublicKey;

            const { blockhash } = await connection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;

            const serializedTransaction = transaction
                .serialize({
                    requireAllSignatures: false,
                    verifySignatures: false,
                })
                .toString("base64");

            const litTransaction = {
                serializedTransaction,
                chain: network,
            };

            await litNodeClient.connect();
            const ethersWallet = new ethers.Wallet(
                userPrivateKey,
                new ethers.providers.JsonRpcProvider(
                    LIT_RPC.CHRONICLE_YELLOWSTONE
                )
            );
            const authMethod = await EthWalletProvider.authenticate({
                signer: ethersWallet,
                litNodeClient,
            });

            const pkpSessionSigs = await litNodeClient.getPkpSessionSigs({
                pkpPublicKey: this.pkp.publicKey,
                chain: "ethereum",
                authMethods: [authMethod],
                resourceAbilityRequests: [
                    {
                        resource: new LitActionResource("*"),
                        ability: LIT_ABILITY.LitActionExecution,
                    },
                    {
                        resource: new LitPKPResource("*"),
                        ability: LIT_ABILITY.PKPSigning,
                    },
                ],
                expiration: new Date(Date.now() + 1000 * 60 * 10).toISOString(), // 10 minutes
            });

            const signedTransaction = await signTransactionWithEncryptedKey({
                pkpSessionSigs,
                network: "solana",
                id: wkResponse.id,
                unsignedTransaction: litTransaction,
                broadcast: broadcastTransaction,
                litNodeClient,
            });
            return signedTransaction;
        } catch (error) {
            console.error(error);
        } finally {
            litNodeClient?.disconnect();
        }
    }
}

class LitTester {
    public litNetwork: LIT_NETWORKS_KEYS;
    public pkp: PKP | null;
    public userPrivateKey: any;
    public initialized: boolean;

    constructor(userPrivateKey: string, litNetwork: LIT_NETWORKS_KEYS) {
        this.litNetwork = litNetwork;
        this.userPrivateKey = userPrivateKey;
        this.pkp = null;
        this.initialized = false;
    }

    static async init(userPrivateKey: string, litNetwork: LIT_NETWORKS_KEYS) {
        const instance = new LitTester(userPrivateKey, litNetwork);
        await instance.initializePKP();
        return instance;
    }

    async initializePKP() {
        if (this.initialized) return;

        try {
            const ethersWallet = new ethers.Wallet(
                this.userPrivateKey,
                new ethers.providers.JsonRpcProvider(
                    LIT_RPC.CHRONICLE_YELLOWSTONE
                )
            );

            const litContracts = new LitContracts({
                signer: ethersWallet,
                network: this.litNetwork,
                debug: false,
            });
            await litContracts.connect();

            const pkp = (await litContracts.pkpNftContractUtils.write.mint())
                .pkp;
            this.pkp = pkp;
            console.log("PKP: ", this.pkp);
            this.initialized = true;
        } catch (error) {
            console.error(error);
            throw error;
        }
    }

    async testLitAction(litActionCode: string, params: Object) {
        if (!this.pkp) {
            throw new Error("PKP not initialized");
        }

        const litNodeClient = new LitNodeClient({
            litNetwork: this.litNetwork,
            debug: false,
        });
        try {
            await litNodeClient.connect();

            const ethersWallet = new ethers.Wallet(
                this.userPrivateKey,
                new ethers.providers.JsonRpcProvider(
                    LIT_RPC.CHRONICLE_YELLOWSTONE
                )
            );

            const authMethod = await EthWalletProvider.authenticate({
                signer: ethersWallet,
                litNodeClient,
            });

            const pkpSessionSigs = await litNodeClient.getPkpSessionSigs({
                pkpPublicKey: this.pkp.publicKey,
                chain: "ethereum",
                authMethods: [authMethod],
                resourceAbilityRequests: [
                    {
                        resource: new LitActionResource("*"),
                        ability: LIT_ABILITY.LitActionExecution,
                    },
                    {
                        resource: new LitPKPResource("*"),
                        ability: LIT_ABILITY.PKPSigning,
                    },
                ],
            });

            const result = await litNodeClient.executeJs({
                sessionSigs: pkpSessionSigs,
                code: litActionCode,
                jsParams: { pkpPublicKey: this.pkp.publicKey, ...params },
            });
            return result;
        } catch (error) {
            console.error(error);
        } finally {
            litNodeClient?.disconnect();
        }
    }
}

export { LitWrapper, LitTester };
