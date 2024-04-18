import os from 'os';
import { readFile } from "fs/promises";
import env from './env';
import { Bot, Context, MemorySessionStorage, NextFunction, SessionFlavor, session } from "grammy";
import { FileAdapter } from '@grammyjs/storage-file';
import { TelegramClient, client } from 'telegram';
import { hydrate, HydrateFlavor } from "@grammyjs/hydrate";
import { getSessionName, getClientForUserId, setupClientHandlers, clientsPool, startAuthorizedClients as launchAllAuthorizedClients } from './clientsPool.js';
import { Config, JsonDB } from 'node-json-db';
import { authorizedUserIds } from './jsonDB';
import { bot } from './bot';
import hanlders from './handlers';

// TODO: start to user bundler or nodemon?
// TODO: when multiple messages in a row comes from the same user, don't repeat his username and other meta info, unless they changed
// TODO: switch to weebhooks? 
// TODO: try to send a message via userId or userId + accessHash 
// TODO: double check that storage stuff in every place is compatible with dev and prod environments (no data conflicts, which is the problem now with 'ids') 

// TODO: add environment switch via .env variable (will affect client and bot startup)
// TODO: to restart client, we need to save their session name in place where we can retrieve it later during startup of the server
//          i.e. it should be some kind of global storage. neither gramjs nor grammy allow that. 


// TODO: when restarting all client, should not forget to check if session is still valid!
// TODO: when bot restarted, we need to restart all the clients also (not there though)!
// TODO: remove user's message with their creds 
// TODO: when waiting for phoneCode should auto reject and clear user creds after some timer elapsed

(async function () {

    await launchAllAuthorizedClients();

    bot
        // only accept updates from private chats with users
        .use(async (ctx: Context, next: NextFunction) => {
            if (ctx.chat?.type === "private" && !ctx.from?.is_bot) await next();
        })
        .use(hydrate())
        .use(
            session({
                initial: () => ({ authParams: {} })
            })
        )
        .use(hanlders);


    bot.catch((e) => {
        console.log("bot.catch error!")
        console.log(e)
    });

    await bot.start();
})();