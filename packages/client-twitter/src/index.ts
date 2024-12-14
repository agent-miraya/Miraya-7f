import { TwitterPostClient } from "./post.ts";
import { TwitterSearchClient } from "./search.ts";
import { TwitterInteractionClient } from "./interactions.ts";
import { IAgentRuntime, Client, elizaLogger } from "@ai16z/eliza";
import { validateTwitterConfig } from "./environment.ts";
import { ClientBase } from "./base.ts";
import { TwitterAccountBalanceClass } from "./monitorAddress.ts";

class TwitterManager {
    client: ClientBase;
    post: TwitterPostClient;
    search: TwitterSearchClient;
    interaction: TwitterInteractionClient;
    monitor: TwitterAccountBalanceClass
    // monitor:
    constructor(runtime: IAgentRuntime) {
        this.client = new ClientBase(runtime);
        this.post = new TwitterPostClient(this.client, runtime);
        // this.search = new TwitterSearchClient(runtime); // don't start the search client by default
        // this searches topics from character file, but kind of violates consent of random users
        // burns your rate limit and can get your account banned
        // use at your own risk
        this.interaction = new TwitterInteractionClient(this.client, runtime);
        this.monitor = new TwitterAccountBalanceClass(this.client, runtime);

        // this.monitor = new monitor(
        //     "wss://api.mainnet-beta.solana.com",
        //     "J5HvPHYHsWQeHdYaTzXTRr5Cx1t6SAqvacFMsvcxgPi3",
        //     "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
        //     1.0 // threshold in SOL
        // );

    }
}

export const TwitterClientInterface: Client = {
    async start(runtime: IAgentRuntime) {
        await validateTwitterConfig(runtime);

        elizaLogger.log("Twitter client started");

        const manager = new TwitterManager(runtime);

        await manager.client.init();

        await manager.monitor.start()

        // await manager.post.start();



        await manager.interaction.start();

        return manager;
    },
    async stop(_runtime: IAgentRuntime) {
        elizaLogger.warn("Twitter client does not support stopping yet");
    },
};

export default TwitterClientInterface;
