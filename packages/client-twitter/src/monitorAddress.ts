import { Connection, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";

import { IAgentRuntime, Memory, ModelClass, composeContext, elizaLogger, generateText, getEmbeddingZeroVector, stringToUuid } from "@ai16z/eliza";
import { ClientBase } from "./base";
import { campaignRoomId, completedCampaignRoomId, startedCampaignRoomId } from "./utils";
import { Tweet } from "agent-twitter-client";
import { truncateToCompleteSentence } from "./postCampaign";
import { getBundledAction } from "lit-actions/src/utils.ts";
import { LitWrapper } from "lit-wrapper-sdk";

const litWrapper = new LitWrapper("datil-dev");


const twitterPostTemplate = `
# Areas of Expertise
{{knowledge}}

# About {{agentName}} (@{{twitterUserName}}):
{{bio}}
{{topics}}

{{providers}}

{{postDirections}}

# Task: Generate a post in the voice and style and perspective of {{agentName}} @{{twitterUserName}}.
Write a post telling users about {{token}} token.
Write a 1-3 sentence post that is informing users about {{token}} token. The goal of post if to inform users that anyone who will promote this token will receive award from pool of {{bounty}} as a price, depepnding on the reach, from the perspective of {{agentName}}. The name of token is {{name}} and slogan is(maybe empty): {{slogan}}. At last you have to inform user that they have to be eligible they have to tag the {{agentName}} and attach their solana public key. Do not add commentary or acknowledge this request, just write the post.
Your response should not contain any questions. Brief, concise statements only. The total character count MUST be less than 280. No emojis. Use \\n\\n (double spaces) between statements.`;


export class TwitterAccountBalanceClass {
    client: ClientBase;
    runtime: IAgentRuntime;
    connection: Connection;

    constructor(client: ClientBase, runtime: IAgentRuntime) {
        this.client = client;
        this.runtime = runtime;
    }

    async getStartedCampaigns() {
        const campaigns = await this.runtime.messageManager.getMemories({
            roomId: startedCampaignRoomId,
            count: 100,
            unique: false,
        });

        campaigns.forEach((campaign) => {
            const a = campaign.createdAt;
            const b = Date.now();
            const diff = Math.abs(b - a);

            const minutes = diff / 1000;

            const timeLimit = 60 * 6 ; // 5 minutes

            if (minutes > timeLimit){
                this.distributeFunds(campaign)
            }
        })

        return campaigns;
    }

    async getCompletedCampaigns() {
        await this.getStartedCampaigns();

        const campaigns = await this.runtime.messageManager.getMemories({
            roomId: completedCampaignRoomId,
            count: 100,
            unique: false,
        });

        this.distributeFunds(campaigns[0])

        return campaigns;
    }

    async getActiveCampaigns() {
        elizaLogger.log("checking active campaigns");
        const campaigns = await this.runtime.messageManager.getMemories({
            roomId: campaignRoomId,
            count: 100,
            unique: false,
        });

        // const activeCampaigns = campaigns
        //     .map((item) => ({...item.content, id: item.id}))
        //     .filter((campaign: any) => !campaign.started);

        // elizaLogger.log("active campaigns", campaigns);

        return campaigns;
    }

    async deleteData(){
        const activeCampaigns = await this.getActiveCampaigns();

        activeCampaigns.forEach(async (campaign) => {
            await this.runtime.messageManager.removeMemory(campaign.id)
        })

        const startedCampaigns = await this.getStartedCampaigns();

        startedCampaigns.forEach(async (campaign) => {
            await this.runtime.messageManager.removeMemory(campaign.id)
        })
    }

    async distributeFunds(campaignMemory: Memory){
        const campaign: any = campaignMemory.content;

        const shillingRoomId = stringToUuid("shilling-tweets-room" + "-" + campaignMemory.id);

        elizaLogger.log("Distributing funds for", campaign?.token);
        if (!campaign?.litWalletResult){
            elizaLogger.log("No distributor", campaign?.token);
            return;
        }

        const applicants = await this.runtime.messageManager.getMemories({
            roomId: shillingRoomId,
            count: 100,
            unique: false,
        });

        if (!applicants){
            elizaLogger.log("No applicants found", campaign?.token);
            return;
        }

        function getRandomNumberBetween1And100() {
            return Math.floor(Math.random() * 100) + 1;
        }

        // Just for testing I am introduging random number, because we can't simulate large number of posts. This must be removed in production.
        const parsedData = applicants.map(memory => {
            const content = memory.content;
            const tweet: any = content.tweet;

            return  {
                username: tweet.username,
                message: tweet.text,
                impressions: tweet.impressions || getRandomNumberBetween1And100(),
                likes: tweet.likes || getRandomNumberBetween1And100(),
                retweets: tweet.retweets || getRandomNumberBetween1And100(),
                followers: tweet.followers || getRandomNumberBetween1And100(),
                timestamp: tweet.timestamp,
                publicKey: content.userAddress,
            }
        })
          // const litActionCode = await getBundledAction("solana-transction");
        const litActionCode = await getBundledAction("distribute-funds");
          // const response = await litWrapper.createSolanaWK(LIT_EVM_PRIVATE_KEY);
        const litWalletResult = campaign.litWalletResult;


        elizaLogger.log("details", parsedData);

        if (!litWalletResult?.pkpInfo?.publicKey) {
            throw new Error("PKP public key not found in response");
        }

        const privateKey = this.runtime.getSetting("LIT_EVM_PRIVATE_KEY");

        if (!privateKey) {
            elizaLogger.log("No private key found");
            return;
        }

        const actionResult = await litWrapper.executeCustomActionOnSolana({
            userPrivateKey: privateKey,
            broadcastTransaction: true,
            litActionCode,
            pkp: litWalletResult?.pkpInfo,
            wk: litWalletResult?.wkInfo,
            params: {
                openaiApiKey: this.runtime.getSetting("OPENAI_API_KEY") ,
                publicKey: litWalletResult?.wkInfo.generatedPublicKey,
                testTweets: parsedData,
                totalAmount: parseFloat(campaign.bounty.replace(/[^\d.]/g, '') ?? 0) * 0.95, // 5% fee
                broadcast: true
            },
            litTransaction: ""
        });

        if (typeof actionResult?.response !== "string"){
            return;
        }

        if (actionResult?.response?.includes("Error")){
            console.log("Error: ", actionResult);
            return;
        }

        const hash = actionResult?.response;

        console.log("Transactiion hash: ", `https://solscan.io/tx/${hash}`)

        await this.runtime.messageManager.createMemory({...campaignMemory, roomId: completedCampaignRoomId})
        await this.runtime.messageManager.removeMemory(campaignMemory.id)
    }

    async start() {
        const handleTwitterInteractionsLoop = () => {
            this.getActiveCampaigns().then((activeCampaigns) => {
                activeCampaigns.forEach((campaign) => {
                    this.handleMonitorActiveCampaign(campaign);
                });
            });
            this.getStartedCampaigns()
            // this.handleTwitterInteractions();
            setTimeout(
                handleTwitterInteractionsLoop,
                Number(30) * 1000 // Default to 2 minutes
            );
        };
        handleTwitterInteractionsLoop();
        // this.deleteData()
        // this.getCompletedCampaigns()
    }

    async handleMonitorActiveCampaign(campaignMemory: Memory) {
        const campaign: any = campaignMemory.content;
        elizaLogger.log("Checking account balance for active campaigns", campaign?.token);
        if (!campaign?.publicKey){
            elizaLogger.log("No public key found for campaign", campaign?.token);
            return;
        }

        try {
            const receiverPublicKey = new PublicKey(campaign.publicKey);

            // const BONK_TOKEN_MINT =
            //     "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"; // BONK token mint address
            // const tokenAccount = await getAssociatedTokenAddress(
            //     new PublicKey(BONK_TOKEN_MINT),
            //     receiverPublicKey
            // );

            const connection = new Connection(
                "https://api.devnet.solana.com/",
                {
                    commitment: "confirmed",
                    confirmTransactionInitialTimeout: 500000,
                }
            );

            // const balance = await connection.getTokenAccountBalance(
            //     tokenAccount,
            //     "processed"
            // );

            const balance = await connection.getBalance(receiverPublicKey);
            const amount = balance / (10 ** 9);

            // console.log("balance", balance)
            // const amount = balance.value.uiAmount;
            // const amount = balance;
            if (amount === null) {
                console.log("No Account Found");
            } else {
                console.log(`found:`, amount, " out of ", campaign.bounty.replace(/[^\d.]/g, ''));
            }

            if (amount >= parseFloat(campaign.bounty.replace(/[^\d.]/g, ''))){
                elizaLogger.log("Funds found for campaign", campaign?.token);
                await this.generateNewTweet(campaign)
                await this.runtime.messageManager.removeMemory(campaignMemory.id)
                await this.runtime.messageManager.createMemory({...campaignMemory, roomId: startedCampaignRoomId})
            }

            elizaLogger.log("Finished checking Accout balance interactions");
        } catch (error) {
            // elizaLogger.error("Error Getting account balance:");
        }
    }

    async handleTwitterInteractions() {
        elizaLogger.log("Checking account balance");

        try {
            const receiverPublicKey = new PublicKey(
                "J5HvPHYHsWQeHdYaTzXTRr5Cx1t6SAqvacFMsvcxgPi3"
            );

            const BONK_TOKEN_MINT =
                "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"; // BONK token mint address
            const tokenAccount = await getAssociatedTokenAddress(
                new PublicKey(BONK_TOKEN_MINT),
                receiverPublicKey
            );

            const connection = new Connection(
                "https://api.mainnet-beta.solana.com",
                {
                    commitment: "confirmed",
                    confirmTransactionInitialTimeout: 500000, // 120 seconds
                    // wsEndpoint: "wss://api.mainnet-beta.solana.com"
                }
            );

            const balance = await connection.getTokenAccountBalance(
                tokenAccount,
                "processed"
            );
            const amount = balance.value.uiAmount;
            if (amount === null) {
                console.log("No Account Found");
            } else {
                console.log(`found:`, amount);
            }

            elizaLogger.log("Finished checking Accout balance interactions");
        } catch (error) {
            elizaLogger.error("Error handling Twitter interactions:", error);
        }
    }

    private async generateNewTweet(campaign: any) {
        elizaLogger.log("Generating new tweet");

        try {
            const roomId = stringToUuid(
                "twitter_generate_room-" + this.client.profile.username
            );
            await this.runtime.ensureUserExists(
                this.runtime.agentId,
                this.client.profile.username,
                this.runtime.character.name,
                "twitter"
            );

            const topics = this.runtime.character.topics.join(", ");

            const state = await this.runtime.composeState(
                {
                    userId: this.runtime.agentId,
                    roomId: roomId,
                    agentId: this.runtime.agentId,
                    content: {
                        text: topics,
                        action: "",
                    },
                },
                {
                    twitterUserName: this.client.profile.username,
                    ...campaign,
                }
            );

            const context = composeContext({
                state,
                template:
                    this.runtime.character.templates?.twitterPostTemplate ||
                    twitterPostTemplate,
            });

            elizaLogger.debug("generate post prompt:\n" + context);

            const newTweetContent = await generateText({
                runtime: this.runtime,
                context,
                modelClass: ModelClass.SMALL,
            });

            // Replace \n with proper line breaks and trim excess spaces
            const formattedTweet = newTweetContent
                .replaceAll(/\\n/g, "\n")
                .trim();

            // Use the helper function to truncate to complete sentence
            const content = truncateToCompleteSentence(formattedTweet);

            if (this.runtime.getSetting("TWITTER_DRY_RUN") === "true") {
                elizaLogger.info(
                    `Dry run: would have posted tweet: ${content}`
                );
                return;
            }

            try {
                elizaLogger.log(`Posting new tweet:\n ${content}`);

                const result = await this.client.requestQueue.add(
                    async () =>
                        await this.client.twitterClient.sendTweet(content)
                );
                const body = await result.json();
                if (!body?.data?.create_tweet?.tweet_results?.result) {
                    console.error("Error sending tweet; Bad response:", body);
                    return;
                }
                const tweetResult = body.data.create_tweet.tweet_results.result;

                const tweet = {
                    id: tweetResult.rest_id,
                    name: this.client.profile.screenName,
                    username: this.client.profile.username,
                    text: tweetResult.legacy.full_text,
                    conversationId: tweetResult.legacy.conversation_id_str,
                    createdAt: tweetResult.legacy.created_at,
                    timestamp: new Date(
                        tweetResult.legacy.created_at
                    ).getTime(),
                    userId: this.client.profile.id,
                    inReplyToStatusId:
                        tweetResult.legacy.in_reply_to_status_id_str,
                    permanentUrl: `https://twitter.com/${this.runtime.getSetting("TWITTER_USERNAME")}/status/${tweetResult.rest_id}`,
                    hashtags: [],
                    mentions: [],
                    photos: [],
                    thread: [],
                    urls: [],
                    videos: [],
                } as Tweet;

                await this.runtime.cacheManager.set(
                    `twitter/${this.client.profile.username}/lastPost`,
                    {
                        id: tweet.id,
                        timestamp: Date.now(),
                    }
                );

                await this.client.cacheTweet(tweet);

                elizaLogger.log(`Tweet posted:\n ${tweet.permanentUrl}`);

                await this.runtime.ensureRoomExists(roomId);
                await this.runtime.ensureParticipantInRoom(
                    this.runtime.agentId,
                    roomId
                );

                await this.runtime.messageManager.createMemory({
                    id: stringToUuid(tweet.id + "-" + this.runtime.agentId),
                    userId: this.runtime.agentId,
                    agentId: this.runtime.agentId,
                    content: {
                        text: newTweetContent.trim(),
                        url: tweet.permanentUrl,
                        source: "twitter",
                    },
                    roomId,
                    embedding: getEmbeddingZeroVector(),
                    createdAt: tweet.timestamp,
                });
            } catch (error) {
                elizaLogger.error("Error sending tweet:", error);
            }
        } catch (error) {
            elizaLogger.error("Error generating new tweet:", error);
        }
    }
}
