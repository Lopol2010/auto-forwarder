import os from 'os';
import { readFile } from "fs/promises";
import env from './env';
import { Bot, Context, MemorySessionStorage, NextFunction, SessionFlavor, session } from "grammy";
import { FileAdapter } from '@grammyjs/storage-file';
import { TelegramClient, client } from 'telegram';
import { hydrate, HydrateFlavor } from "@grammyjs/hydrate";
import { getSessionName, getClientForUserId, setupClientHandlers, clientsPool, launchAllAuthorizedClients } from './clientsPool.js';
import { Config, JsonDB } from 'node-json-db';
import { authorizedUserIds } from './jsonDB';
import { bot } from './bot';
import hanlders from './handlers';

// TODO: when waiting for phoneCode (and other auth input)
//       should auto reject and clear user creds after some timer elapsed, maybe send then notification about that

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