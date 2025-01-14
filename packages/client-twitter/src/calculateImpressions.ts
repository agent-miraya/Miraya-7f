import { allTweets } from "./allTweets";
interface TweetStats {
    impressions: number;
    likes: number;
    retweets: number;
    replies: number;
}

function calculateStats(tweets: typeof allTweets): TweetStats {
    return tweets.reduce(
        (acc, tweet) => {
            acc.impressions += tweet.views || 0;
            acc.likes += tweet.likes;
            acc.retweets += tweet.retweets;
            acc.replies += tweet.replies;
            return acc;
        },
        { impressions: 0, likes: 0, retweets: 0, replies: 0 }
    );
}

const stats = calculateStats(allTweets);
console.log(allTweets.length, stats);
