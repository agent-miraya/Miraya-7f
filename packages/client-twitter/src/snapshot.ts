import { SearchMode, Tweet } from "agent-twitter-client";
import {
    getEmbeddingZeroVector,
    IAgentRuntime,
    ModelClass,
    stringToUuid,
    parseBooleanFromText,
    generateObject,
} from "@ai16z/eliza";
import { elizaLogger } from "@ai16z/eliza";
import { ClientBase } from "./base.ts";
import * as fs from "fs";
import { query } from "./database";

async function saveLeaderboardResults(
    campaignId: string,
    leaderboard: { username: string; score: number }[]
) {
    const leaderboardData = leaderboard.map((item, index) => ({
        campaignId,
        rank: index + 1,
        username: item.username,
        score: parseFloat(String(item.score)),
    }));

    await query("DELETE FROM leaderboard WHERE campaign_id = $1", [campaignId]);

    for (const entry of leaderboardData) {
        await query(
            "INSERT INTO leaderboard (campaign_id, rank, username, score) VALUES ($1, $2, $3, $4)",
            [entry.campaignId, entry.rank, entry.username, entry.score]
        );
    }

    elizaLogger.log(`Leaderboard results saved for campaign ${campaignId}`);
}

function saveJsonToFile(jsonData: any, fileName: string): void {
    const jsonString = JSON.stringify(jsonData, null, 2);
    fs.writeFileSync(fileName, jsonString, "utf8");
}

export class TwitterSnapshotClient {
    client: ClientBase;
    runtime: IAgentRuntime;

    constructor(client: ClientBase, runtime: IAgentRuntime) {
        this.client = client;
        this.runtime = runtime;
    }

    async getQualityScores(allTweets: Tweet[]) {
        const payload = allTweets.map((item) => ({
            text: item.text,
            id: item.id,
        }));

        const systemPrompt = `
          You are a tweet scoring robot.

          You have to score the tweets that are meant to promote this project-

          <project>
            Miraya 7f - Autonomous Campaigning Agent, launch campaigns and reward shillers.

            7f is an X agent, any user can tag @miraya7f with a prompt for campaign duration, token's ticker, amount, and number of winners. The agent will launch a campaign and reply with an escrow address to the user's tweet.

            Once the User funds the address with the said amount, those funds get locked on the address (TEE). Miraya will announce the campaign on its official handle with the campaign-specific hashtag, this will let the users start posting content around campaign-specific tokens using the hashtag.

            Miraya's AI runs a Snapshooter to capture all the activities over the campaign-specific hashtag and inferences over them to compute results.

            Post activities are taken into account:

            There's a community airdrop also going on, so projects may promote the airdrop to get more engagement.

            Engaging users to follow our handle @miraya7f and Telegram is a positive sign.
          <project>

          <rules>
            You have to score 1 to 100 points to the list of users tweets.
            Analyze the tweet data and allocate amounts to influencers based on their tweet quality.
            The Quality of Text is assessed using an AI-driven evaluation system- Insightfulness, Grammar & Structure, and Engagement Context(encouraging meaningful engagement, flagged by AI for non-clickbait content)
            The max point should be 100 and min should be 0.
            The text can be in any language. There is no language constrain. For non-english text, Grammar & Structure can be ignored.
            The fairness should be key. The distribution should be based on the quality of the tweet.
            The sentiment of the tweet should be considered.
            The goal of tweet can be to promote the project, airdrop, or campaign.
          <rules>


          Return ONLY a JSON array of objects with tweet id and score fields.
          The result should be fair and square. No negative points.
          Example output format: [{"id": "12123213", "points": 60}, {"id": "1678", "points":  40}].
          The key of JSON will be scores

          Tweet Data: ${JSON.stringify(payload)}.
        `;

        const scores = await generateObject({
            runtime: this.runtime,
            context: systemPrompt,
            modelClass: ModelClass.LARGE,
        });

        return scores;
    }

    async start(postImmediately: boolean = false) {
        if (!this.client.profile) {
            await this.client.init();
        }

        const generateNewTweetLoop = async () => {
            const lastPost = await this.runtime.cacheManager.get<{
                timestamp: number;
            }>(
                "twitter/" +
                    this.runtime.getSetting("TWITTER_USERNAME") +
                    "/lastPost"
            );

            const lastPostTimestamp = lastPost?.timestamp ?? 0;
            const minMinutes =
                parseInt(this.runtime.getSetting("POST_INTERVAL_MIN")) || 90;
            const maxMinutes =
                parseInt(this.runtime.getSetting("POST_INTERVAL_MAX")) || 180;
            const randomMinutes =
                Math.floor(Math.random() * (maxMinutes - minMinutes + 1)) +
                minMinutes;
            const delay = randomMinutes * 60 * 1000;

            if (Date.now() > lastPostTimestamp + delay) {
                await this.handleSnapshots();
            }

            setTimeout(() => {
                generateNewTweetLoop(); // Set up next iteration
            }, delay);

            elizaLogger.log(`Next tweet scheduled in ${randomMinutes} minutes`);
        };
        if (
            this.runtime.getSetting("POST_IMMEDIATELY") != null &&
            this.runtime.getSetting("POST_IMMEDIATELY") != ""
        ) {
            postImmediately = parseBooleanFromText(
                this.runtime.getSetting("POST_IMMEDIATELY")
            );
        }
        if (postImmediately) {
            this.handleSnapshots();
        }

        generateNewTweetLoop();
    }

    private async postTweet(content: string) {
        elizaLogger.log("Posting new tweet");

        try {
            const roomId = stringToUuid(
                "twitter_snapshot_room-" + this.client.profile.username
            );
            await this.runtime.ensureUserExists(
                this.runtime.agentId,
                this.client.profile.username,
                this.runtime.character.name,
                "twitter"
            );

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
                        text: content,
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

    private async scrapeTweets() {
        let cursor: string;
        const fetchedCursors = [];
        const allTweets: Tweet[] = [];

        while (true) {
            console.log("fetching cursor", cursor);
            await new Promise((resolve) =>
                setTimeout(resolve, 5000 + Math.random() * 5000)
            );

            const recentTweets = await this.client.fetchSearchTweets(
                "#miraya7f",
                20,
                SearchMode.Latest,
                cursor
            );

            // console.log("recentTweets", recentTweets.tweets.length, recentTweets.next, recentTweets.previous )

            cursor = recentTweets.next;
            fetchedCursors.push(cursor);

            allTweets.push(...recentTweets.tweets);
            if (recentTweets.tweets.length < 1) {
                break;
            }
        }

        saveJsonToFile(allTweets, "allTweets.json");

        return allTweets;
    }

    async handleSnapshots() {
        const allTweets: Tweet[] = (await this.scrapeTweets()) as Tweet[];

        const scores = await this.getLeaderboard(allTweets);

        await saveLeaderboardResults(stringToUuid("miraya7f"), scores);

        const leaderboard = scores.slice(0, 10);

        const tweetTemplate = `
Snapshooter: Below is the leaderboard for accounts using our hashtag #miraya7f 🚀

${leaderboard
    .map((item, index) => {
        return `${index + 1}. @${item.username}`;
    })
    .join("\n")}
        `;

        console.log("tweetTemplate", tweetTemplate);

        // await this.postTweet(tweetTemplate);
    }

    private async calculatePointScore(allTweets: Tweet[]) {
        const qualityScores: { id: string; points: number }[] =
            await this.getQualityScores(allTweets);

        const scores = {
            impressions: 0.01, // 1 point per 100 impressions
            likes: 1,
            retweets: 4,
            replies: 2,
        };

        const scoredTweets = allTweets.map((tweet) => {
            let pointScore = 0;

            pointScore += tweet.views * scores.impressions;
            pointScore += tweet.likes * scores.likes;
            pointScore += tweet.retweets * scores.retweets;
            pointScore += tweet.replies * scores.replies;

            const qualityScore =
                qualityScores.find((item) => item.id === tweet.id)?.points || 0;

            // console.log("qualityScore", qualityScore, tweet.text);
            const qualityScoreMultiplier = 1 + qualityScore / 100;
            const score = pointScore * qualityScoreMultiplier;

            return { tweet, score };
        });

        return scoredTweets;
    }

    private async getLeaderboard(tweets: Tweet[]) {
        const filteredTweets = tweets.filter((tweet) => {
            return tweet.username !== "miraya7f";
        });

        console.log("filteredTweets", filteredTweets.length);

        const maxBreakLimit = 50;
        // this.runtime.databaseAdapter.createRoom("twitter-snapshot");

        let scoredTweets: {
            tweet: Tweet;
            score: number;
        }[] = [];

        if (filteredTweets.length > maxBreakLimit) {
            const tweetChunks = [];
            for (let i = 0; i < filteredTweets.length; i += maxBreakLimit) {
                tweetChunks.push(filteredTweets.slice(i, i + maxBreakLimit));
            }

            for (const chunk of tweetChunks) {
                const scoredChunk = await this.calculatePointScore(chunk);
                scoredTweets = scoredTweets.concat(scoredChunk);
            }
        } else {
            scoredTweets = await this.calculatePointScore(filteredTweets);
        }

        const userScores = scoredTweets.reduce((acc, { tweet, score }) => {
            if (!acc[tweet.username]) {
                acc[tweet.username] = 0;
            }
            acc[tweet.username] += score;
            return acc;
        }, {});

        const userScoresArray = Object.entries(userScores).map((item) => {
            return {
                username: item[0],
                score: item[1] as number,
            };
        });

        const sortedScores = userScoresArray.sort((a, b) => b.score - a.score);

        return sortedScores;
    }
}
