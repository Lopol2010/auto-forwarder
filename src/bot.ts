import os from 'os';
import { readFile } from "fs/promises";
import env from './env';
import { Bot, Context, MemorySessionStorage, NextFunction, SessionFlavor, session } from "grammy";
import { FileAdapter } from '@grammyjs/storage-file';
import { TelegramClient, client } from 'telegram';
import { hydrate, HydrateFlavor } from "@grammyjs/hydrate";
import { Conversation, ConversationFlavor, conversations, createConversation } from "@grammyjs/conversations"
import { getSessionName, newTelegramClient as getClientForUserId, sendCode, setupClientHandlers, userbotsPool, newTelegramClient } from './userbot.js';
import { Config, JsonDB } from 'node-json-db';

// TODO: double check that storage stuff in every place is compatible with dev and prod environments (no data conflicts, which is the problem now with 'ids') 

// TODO: add environment switch via .env variable (will affect userbot and bot startup)
// TODO: to restart userbots, we need to save their session name in place where we can retrieve it later during startup of the server
//          i.e. it should be some kind of global storage. neither gramjs nor grammy allow that. 


// TODO: when restarting all userbots, should not forget to check if session is still valid!
// TODO: when bot restarted, we need to restart all the clients also (not there though)!
// TODO: remove user's message with their creds 
// TODO: when waiting for phoneCode should auto reject and clear user creds after some timer elapsed


interface SessionData {
    authParams?: {
        // phoneNumber?: string,
        // password?: string,
        // phoneCodeResolve?: (phoneCode: string) => void,
        // phoneCodeReject?: () => void,
    },
}

type MyContext = HydrateFlavor<Context> & SessionFlavor<SessionData>;

const db = new JsonDB(new Config("userbot_sessions_ids", true, true, '/'));
(async function () {

    await db.push("/ids", [], false);
    await db.getData("/ids").then((userbot_sessions: number[]) => {
        // console.log("saved userbot sessions: " + (userbot_sessions || "[]"));
        userbot_sessions.forEach(async (id, i) => {
            console.log("trying to restore userbot for: " + id);
            const client = await getClientForUserId(id);
            console.log(`userbot-${id} auth status is: ${await client.isUserAuthorized()}`);
            await setupClientHandlers(client);
        });
    })

})()

const bot = new Bot<MyContext>(env.BOT_TOKEN, {
    client: {
        environment: env.NODE_ENV === "prod" ? "prod" : "test"
    }
});

bot.use(async (ctx: Context, next: NextFunction) => {
    // allow only private user chats
    if (ctx.chat?.type === "private" && !ctx.from?.is_bot) await next();
});
bot.use(hydrate());
bot.use(
    session({
        // type: "multi",
        // authParams: { },
    })
);

//TODO:  this approach with global variable won't work if there is multiple users authorizing!
let authResolver: ((value: string) => void) | null;
bot.command("start", async (ctx) => {

    const userId = ctx.chat.id;
    let client = await newTelegramClient(userId);

    if (client.connected && await client.isUserAuthorized()) {
        await ctx.reply("You are already authorized!");
        return;
    }


    client.start({
        phoneNumber: async () => new Promise(async (resolve, reject) => {
            await ctx.reply("Enter your phone number");
            authResolver = resolve;
        }),
        password: async () => new Promise(async (resolve, reject) => {
            await ctx.reply("Enter your password");
            authResolver = resolve;
        }),
        phoneCode: async () => new Promise(async (resolve, reject) => {
            let msgAsk = await ctx.reply("Enter phone code received from telegram, precede with underscore! Example: _00000");
            // authResolver = (value: string) => resolve(value.slice(1));
            authResolver = resolve;
        }),
        onError: async (err) => {
            console.log("client.start error: " + err);
            return true;
        },
    }).then(async () => {
        authResolver = null;

        await ctx.reply("You were logged in, everything should work now.");
        let isLoggedInUserIdSaved = (await db.find<number>("/ids", (entry, i) => entry == userId)) != undefined;
        if (!isLoggedInUserIdSaved) {
            db.push("/ids[]", userId)
        }
        setupClientHandlers(client);
    });
});

bot.on("message:text", (ctx) => {
    console.log('authResolver being called!');
    authResolver?.(ctx.message.text);
});

bot.catch((e) => {
    console.log("bot.catch error!")
    console.log(e)
})

bot.start();