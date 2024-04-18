import env from './env';
import { Bot, Composer, Context, MemorySessionStorage, NextFunction, SessionFlavor, session } from "grammy";
import { hydrate, HydrateFlavor } from "@grammyjs/hydrate";
import { getSessionName, getClientForUserId, setupClientHandlers, clientsPool } from './clientsPool.js';
import { authorizedUserIds } from './jsonDB';
import { MyContext } from './bot';

const composer = new Composer<MyContext>();
export default composer;

composer.command("start", async (ctx) => {

    const userId = ctx.from?.id;
    if(!userId) return;

    let client = await getClientForUserId(userId);

    if (client.connected && await client.isUserAuthorized()) {
        await ctx.reply("You are already authorized!");
        return;
    }

    client.start({
        phoneNumber: async () => new Promise(async (resolve, reject) => {
            await ctx.reply("Enter your phone number");
            ctx.session.authParams.authResolver = resolve;
        }),
        password: async () => new Promise(async (resolve, reject) => {
            await ctx.reply("Enter your password");
            ctx.session.authParams.authResolver = resolve;
        }),
        phoneCode: async () => new Promise(async (resolve, reject) => {
            await ctx.reply("Enter code received from telegram, precede with underscore! Example: _00000");
            ctx.session.authParams.authResolver = resolve;
        }),
        onError: async (err) => {
            return true;
        },
    }).then(async () => {
        await ctx.reply("You were logged in, everything should work now.");
        await authorizedUserIds.saveUserId(userId);
    }).catch(async err => {
        await ctx.reply("Authorization failed, please try again: /start");
    }).finally(() => {
        ctx.session.authParams.authResolver = null;
    });
});

composer.on("message:text", (ctx) => {
    ctx.session.authParams.authResolver?.(ctx.message.text);
});