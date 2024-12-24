import { Tweet } from "agent-twitter-client";
import { getEmbeddingZeroVector } from "@ai16z/eliza";
import { Content, Memory, UUID } from "@ai16z/eliza";
import { stringToUuid } from "@ai16z/eliza";
import { ClientBase } from "./base";
import { elizaLogger } from "@ai16z/eliza";
import { LitWrapper } from "lit-wrapper-sdk";
import { getBundledAction } from "lit-actions/src/utils";

const litWrapper = new LitWrapper("datil-dev")

export async function generateSolanaWallet(
     LIT_EVM_PRIVATE_KEY: string,
) {
    console.log("Generating solana wallet")
    const res = await litWrapper.createSolanaWK(LIT_EVM_PRIVATE_KEY);
    return res
}

export async function sendBONKTxn(res: any, amount: number, receiver: string, LIT_EVM_PRIVATE_KEY: string) {
    // console.log("Sending BONK Tokens to ", res);
    // const signedTx = await litWrapper.sendSolanaWKTxnWithCustomToken({
    //     tokenMintAddress: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", // BONK MINT TOKEN
    //     amount: amount * Math.pow(10, 5),
    //     toAddress: receiver,
    //     network: "mainnet-beta",
    //     broadcastTransaction: true,
    //     userPrivateKey: LIT_EVM_PRIVATE_KEY,
    //     wkResponse: res.wkInfo,
    //     pkp: res.pkpInfo,
    // });


    // console.log("Transaction Hash: ", signedTx);

    // return signedTx;
}

const MAX_TWEET_LENGTH = 280; // Updated to Twitter's current character limit

export const wait = (minTime: number = 1000, maxTime: number = 3000) => {
    const waitTime =
        Math.floor(Math.random() * (maxTime - minTime + 1)) + minTime;
    return new Promise((resolve) => setTimeout(resolve, waitTime));
};

export const isValidTweet = (tweet: Tweet): boolean => {
    // Filter out tweets with too many hashtags, @s, or $ signs, probably spam or garbage
    const hashtagCount = (tweet.text?.match(/#/g) || []).length;
    const atCount = (tweet.text?.match(/@/g) || []).length;
    const dollarSignCount = (tweet.text?.match(/\$/g) || []).length;
    const totalCount = hashtagCount + atCount + dollarSignCount;

    return (
        hashtagCount <= 1 &&
        atCount <= 2 &&
        dollarSignCount <= 1 &&
        totalCount <= 3
    );
};

export async function buildConversationThread(
    tweet: Tweet,
    client: ClientBase,
    maxReplies: number = 10
): Promise<Tweet[]> {
    const thread: Tweet[] = [];
    const visited: Set<string> = new Set();

    async function processThread(currentTweet: Tweet, depth: number = 0) {
        elizaLogger.debug("Processing tweet:", {
            id: currentTweet.id,
            inReplyToStatusId: currentTweet.inReplyToStatusId,
            depth: depth,
        });

        if (!currentTweet) {
            elizaLogger.debug("No current tweet found for thread building");
            return;
        }

        // Stop if we've reached our reply limit
        if (depth >= maxReplies) {
            elizaLogger.debug("Reached maximum reply depth", depth);
            return;
        }

        // Handle memory storage
        const memory = await client.runtime.messageManager.getMemoryById(
            stringToUuid(currentTweet.id + "-" + client.runtime.agentId)
        );
        if (!memory) {
            const roomId = stringToUuid(
                currentTweet.conversationId + "-" + client.runtime.agentId
            );
            const userId = stringToUuid(currentTweet.userId);

            await client.runtime.ensureConnection(
                userId,
                roomId,
                currentTweet.username,
                currentTweet.name,
                "twitter"
            );

            await client.runtime.messageManager.createMemory({
                id: stringToUuid(
                    currentTweet.id + "-" + client.runtime.agentId
                ),
                agentId: client.runtime.agentId,
                content: {
                    text: currentTweet.text,
                    source: "twitter",
                    url: currentTweet.permanentUrl,
                    inReplyTo: currentTweet.inReplyToStatusId
                        ? stringToUuid(
                              currentTweet.inReplyToStatusId +
                                  "-" +
                                  client.runtime.agentId
                          )
                        : undefined,
                },
                createdAt: currentTweet.timestamp * 1000,
                roomId,
                userId:
                    currentTweet.userId === client.profile.id
                        ? client.runtime.agentId
                        : stringToUuid(currentTweet.userId),
                embedding: getEmbeddingZeroVector(),
            });
        }

        if (visited.has(currentTweet.id)) {
            elizaLogger.debug("Already visited tweet:", currentTweet.id);
            return;
        }

        visited.add(currentTweet.id);
        thread.unshift(currentTweet);

        elizaLogger.debug("Current thread state:", {
            length: thread.length,
            currentDepth: depth,
            tweetId: currentTweet.id,
        });

        // If there's a parent tweet, fetch and process it
        if (currentTweet.inReplyToStatusId) {
            elizaLogger.debug(
                "Fetching parent tweet:",
                currentTweet.inReplyToStatusId
            );
            try {
                const parentTweet = await client.twitterClient.getTweet(
                    currentTweet.inReplyToStatusId
                );

                if (parentTweet) {
                    elizaLogger.debug("Found parent tweet:", {
                        id: parentTweet.id,
                        text: parentTweet.text?.slice(0, 50),
                    });
                    await processThread(parentTweet, depth + 1);
                } else {
                    elizaLogger.debug(
                        "No parent tweet found for:",
                        currentTweet.inReplyToStatusId
                    );
                }
            } catch (error) {
                elizaLogger.error("Error fetching parent tweet:", {
                    tweetId: currentTweet.inReplyToStatusId,
                    error,
                });
            }
        } else {
            elizaLogger.debug(
                "Reached end of reply chain at:",
                currentTweet.id
            );
        }
    }

    await processThread(tweet, 0);

    elizaLogger.debug("Final thread built:", {
        totalTweets: thread.length,
        tweetIds: thread.map((t) => ({
            id: t.id,
            text: t.text?.slice(0, 50),
        })),
    });

    return thread;
}

export async function sendTweet(
    client: ClientBase,
    content: Content,
    roomId: UUID,
    twitterUsername: string,
    inReplyTo: string
): Promise<Memory[]> {
    const tweetChunks = splitTweetContent(content.text);
    const sentTweets: Tweet[] = [];
    let previousTweetId = inReplyTo;

    for (const chunk of tweetChunks) {
        const result = await client.requestQueue.add(
            async () =>
                await client.twitterClient.sendTweet(
                    chunk.trim(),
                    previousTweetId
                )
        );
        const body = await result.json();

        // if we have a response
        if (body?.data?.create_tweet?.tweet_results?.result) {
            // Parse the response
            const tweetResult = body.data.create_tweet.tweet_results.result;
            const finalTweet: Tweet = {
                id: tweetResult.rest_id,
                text: tweetResult.legacy.full_text,
                conversationId: tweetResult.legacy.conversation_id_str,
                timestamp:
                    new Date(tweetResult.legacy.created_at).getTime() / 1000,
                userId: tweetResult.legacy.user_id_str,
                inReplyToStatusId: tweetResult.legacy.in_reply_to_status_id_str,
                permanentUrl: `https://twitter.com/${twitterUsername}/status/${tweetResult.rest_id}`,
                hashtags: [],
                mentions: [],
                photos: [],
                thread: [],
                urls: [],
                videos: [],
            };
            sentTweets.push(finalTweet);
            previousTweetId = finalTweet.id;
        } else {
            console.error("Error sending chunk", chunk, "repsonse:", body);
        }

        // Wait a bit between tweets to avoid rate limiting issues
        await wait(1000, 2000);
    }

    const memories: Memory[] = sentTweets.map((tweet) => ({
        id: stringToUuid(tweet.id + "-" + client.runtime.agentId),
        agentId: client.runtime.agentId,
        userId: client.runtime.agentId,
        content: {
            text: tweet.text,
            source: "twitter",
            url: tweet.permanentUrl,
            inReplyTo: tweet.inReplyToStatusId
                ? stringToUuid(
                      tweet.inReplyToStatusId + "-" + client.runtime.agentId
                  )
                : undefined,
        },
        roomId,
        embedding: getEmbeddingZeroVector(),
        createdAt: tweet.timestamp * 1000,
    }));

    return memories;
}

function splitTweetContent(content: string): string[] {
    const maxLength = MAX_TWEET_LENGTH;
    const paragraphs = content.split("\n\n").map((p) => p.trim());
    const tweets: string[] = [];
    let currentTweet = "";

    for (const paragraph of paragraphs) {
        if (!paragraph) continue;

        if ((currentTweet + "\n\n" + paragraph).trim().length <= maxLength) {
            if (currentTweet) {
                currentTweet += "\n\n" + paragraph;
            } else {
                currentTweet = paragraph;
            }
        } else {
            if (currentTweet) {
                tweets.push(currentTweet.trim());
            }
            if (paragraph.length <= maxLength) {
                currentTweet = paragraph;
            } else {
                // Split long paragraph into smaller chunks
                const chunks = splitParagraph(paragraph, maxLength);
                tweets.push(...chunks.slice(0, -1));
                currentTweet = chunks[chunks.length - 1];
            }
        }
    }

    if (currentTweet) {
        tweets.push(currentTweet.trim());
    }

    return tweets;
}

function splitParagraph(paragraph: string, maxLength: number): string[] {
    // eslint-disable-next-line
    const sentences = paragraph.match(/[^\.!\?]+[\.!\?]+|[^\.!\?]+$/g) || [
        paragraph,
    ];
    const chunks: string[] = [];
    let currentChunk = "";

    for (const sentence of sentences) {
        if ((currentChunk + " " + sentence).trim().length <= maxLength) {
            if (currentChunk) {
                currentChunk += " " + sentence;
            } else {
                currentChunk = sentence;
            }
        } else {
            if (currentChunk) {
                chunks.push(currentChunk.trim());
            }
            if (sentence.length <= maxLength) {
                currentChunk = sentence;
            } else {
                // Split long sentence into smaller pieces
                const words = sentence.split(" ");
                currentChunk = "";
                for (const word of words) {
                    if (
                        (currentChunk + " " + word).trim().length <= maxLength
                    ) {
                        if (currentChunk) {
                            currentChunk += " " + word;
                        } else {
                            currentChunk = word;
                        }
                    } else {
                        if (currentChunk) {
                            chunks.push(currentChunk.trim());
                        }
                        currentChunk = word;
                    }
                }
            }
        }
    }

    if (currentChunk) {
        chunks.push(currentChunk.trim());
    }

    return chunks;
}
export const campaignRoomId = stringToUuid("campaigns-room");
export const startedCampaignRoomId = stringToUuid("started-campaigns");
export const completedCampaignRoomId = stringToUuid("completed-campaigns");
export const shillingTweets = stringToUuid("shilling-tweets-room");
export async function saveCampaignMemory(
    client: ClientBase,
    content: Content,
    roomId: UUID,
): Promise<Memory> {
    const memoryid = stringToUuid("campaign-" + roomId );
    const memory = await client.runtime.messageManager.getMemoryById(memoryid);
    console.log("Memory", memory, roomId)

    if (!memory){
        const memories: Memory = {
            id: memoryid,
            agentId: client.runtime.agentId,
            userId: client.runtime.agentId,
            content: {
                ...content            },
            roomId: campaignRoomId,
            embedding: getEmbeddingZeroVector(),
        }

        await client.runtime.messageManager.createMemory(
            memories
        );
    }

    return memory
}


export async function distributeFunds(applicantMemory: Memory, campaignMemory: Memory,  LIT_EVM_PRIVATE_KEY: string){
    const campaign: any = campaignMemory.content;

    elizaLogger.log("Distributing funds for", campaign?.token);
    if (!campaign?.litWalletResult){
        elizaLogger.log("No distributor", campaign?.token);
        return;
    }

    const tweet: any = applicantMemory.content;
    const reward = parseFloat(campaign.bounty.replace(/[^\d.]/g, '')) / 5;
    return await sendBONKTxn(campaign?.litWalletResult, reward, tweet.userAddress as string, LIT_EVM_PRIVATE_KEY ).catch(error => console.log(error.message) )
}


export async function handleAgentQuery(campaignMemory: Memory, MESSAGE: string, client: ClientBase,){
    const campaign: any = campaignMemory.content;

    const litWalletResult = campaign.litWalletResult;

    if (!litWalletResult){
        elizaLogger.log("No wallet assigned", campaign?.token);
        return;
    }

    const litActionCode = await getBundledAction("agent-kit");

    if (!litWalletResult?.pkpInfo?.publicKey) {
        throw new Error("PKP public key not found in response");
    }

    const privateKey = client.runtime.getSetting("LIT_EVM_PRIVATE_KEY");

    if (!privateKey) {
        elizaLogger.log("No private key found");
        return;
    }

    const {
        ciphertext: solanaCipherText,
        dataToEncryptHash: solanaDataToEncryptHash,
    } = await litWrapper.getDecipheringDetails({ userPrivateKey: privateKey, pkp: litWalletResult?.pkpInfo, wk: litWalletResult?.wkInfo })

    const accessControlConditions = {
        contractAddress: "",
        standardContractType: "",
        chain: "ethereum",
        method: "",
        parameters: [":userAddress"],
        returnValueTest: {
            comparator: "=",
            value: litWalletResult.pkpInfo.ethAddress,
        },
    }

    const actionResult = await litWrapper.executeCustomActionOnSolana({
        userPrivateKey: privateKey,
        broadcastTransaction: true,
        litActionCode,
        pkp: litWalletResult?.pkpInfo,
        wk: litWalletResult?.wkInfo,
        params: {
            // MESSAGE: "Launch token names LIT with ticker $LIT on pump.fun with description 'hahaha, it worked!",
            MESSAGE: MESSAGE,
            ciphertext: solanaCipherText,
            dataToEncryptHash: solanaDataToEncryptHash,
            accessControlConditions: [accessControlConditions],
            RPC_URL: "https://api.devnet.solana.com",
            OPENAI_API_KEY: client.runtime.getSetting("OPENAI_API_KEY"),
        },
        litTransaction: ""
    });


    console.log("actionResult", actionResult)

    const result = actionResult?.response;

    return result;
    //
    // return actionResult?.logs
}
