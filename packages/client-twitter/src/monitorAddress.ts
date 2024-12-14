import { Connection, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";

import {
    IAgentRuntime, elizaLogger
} from "@ai16z/eliza";
import { ClientBase } from "./base";
export class TwitterAccountBalanceClass {
    client: ClientBase;
    runtime: IAgentRuntime;

    constructor(client: ClientBase, runtime: IAgentRuntime) {
        this.client = client;
        this.runtime = runtime;
    }

    async start() {
        const handleTwitterInteractionsLoop = () => {
            this.handleTwitterInteractions();
            setTimeout(
                handleTwitterInteractionsLoop,
                Number(
                    30
                ) * 1000 // Default to 2 minutes
            );
        };
        handleTwitterInteractionsLoop();
    }

    async handleTwitterInteractions() {
        elizaLogger.log("Checking account balance");

        try {
              const receiverPublicKey = new PublicKey("J5HvPHYHsWQeHdYaTzXTRr5Cx1t6SAqvacFMsvcxgPi3");

              const BONK_TOKEN_MINT =
                  "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"; // BONK token mint address
              const tokenAccount = await getAssociatedTokenAddress(
                  new PublicKey(BONK_TOKEN_MINT),
                  receiverPublicKey
              );

            const connection = new Connection("https://api.mainnet-beta.solana.com", {
                commitment: "confirmed",
                confirmTransactionInitialTimeout: 500000, // 120 seconds
                // wsEndpoint: "wss://api.mainnet-beta.solana.com"
            });

            const balance = await connection.getTokenAccountBalance(
                tokenAccount,
                "processed"
            );
            const amount = balance.value.uiAmount;
            if (amount === null) {
                console.log(
                    "No Account Found"
                );
            } else {
                console.log(`found:`, amount);
            }

            elizaLogger.log("Finished checking Accout balance interactions");
        } catch (error) {
            elizaLogger.error("Error handling Twitter interactions:", error);
        }
    }
}

// export class SolanaMonitor {
//     private connection: Connection;
//     private addressToWatch: PublicKey;
//     private tokenToWatch: PublicKey;
//     private threshold: number;

//     constructor(
//         rpcUrl: string,
//         addressToWatch: string,
//         tokenToWatch: string,
//         threshold: number
//     ) {
//         this.connection = new Connection(rpcUrl, "confirmed");
//         this.addressToWatch = new PublicKey(addressToWatch);
//         this.tokenToWatch = new PublicKey(tokenToWatch);
//         this.threshold = threshold;
//     }

//     // Monitor transactions for specific address
//     async monitorTransactions() {
//         console.log(
//             `Starting to monitor transactions for ${this.addressToWatch.toString()}`
//         );

//         this.connection.onAccountChange(
//             this.addressToWatch,
//             async (accountInfo) => {
//                 console.log("Transaction detected!");
//                 console.log("Account info:", accountInfo);

//                 // Here you can call your token creation function
//                 try {
//                     // You'll need to implement the actual call to createAndBuyToken
//                     // with appropriate parameters
//                     await this.triggerTokenCreation();
//                 } catch (error) {
//                     console.error("Error creating token:", error);
//                 }
//             },
//             "confirmed"
//         );
//     }

//     // Monitor token balance
//     async monitorTokenBalance() {
//         console.log(
//             `Starting to monitor token balance for ${this.tokenToWatch.toString()}`
//         );

//         // Get token account
//         const tokenAccount = await getAccount(
//             this.connection,
//             this.tokenToWatch
//         );

//         this.connection.onAccountChange(
//             tokenAccount.address,
//             async (accountInfo, context) => {
//                 const balance = Number(accountInfo.lamports) / 1e9; // Convert from lamports to SOL
//                 console.log(`Current balance: ${balance} SOL`);

//                 if (balance >= this.threshold) {
//                     console.log(
//                         `Balance threshold reached! (${balance} >= ${this.threshold})`
//                     );
//                     await this.triggerThresholdAction();
//                 }
//             }
//         );
//     }

//     // Function to trigger token creation
//     private async triggerTokenCreation() {
//         console.log("Triggering token creation...");
//     }

//     // Function to trigger action when threshold is reached
//     private async triggerThresholdAction() {
//         // Implement your threshold action here
//         console.log("Threshold reached! Executing action...");
//         // Add your custom logic here
//     }

//     // Start monitoring both transactions and balance
//     async startMonitoring() {
//         await this.monitorTransactions();
//         await this.monitorTokenBalance();
//         console.log("Monitoring started...");
//     }
// }
