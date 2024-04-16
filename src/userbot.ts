import os from 'os';
import { readFile } from "fs/promises";
import { Api, TelegramClient, password } from "telegram";
import { StoreSession } from "telegram/sessions/index.js";
// @ts-ignore
import input from "input";
import env from './env';
import { NewMessage } from 'telegram/events/index.js';
import { EditedMessage } from 'telegram/events/EditedMessage.js';
import { PromisedNetSockets } from 'telegram/extensions/PromisedNetSockets.js';


// TODO: create basic authorization through BOT !

export const userbotsPool: { [index: string]: TelegramClient } = {

}

async function getClientMetaInfo() {
    const filePath = './package.json';
    const fileContentString = (await readFile(filePath)).toString();
    const pkg = JSON.parse(fileContentString);

    return {
        deviceModel: `${pkg.name}@${os.hostname()}`,
        systemVersion: os.version() || 'Unknown',
        appVersion: pkg.version,
    }
}
export function getSessionName(userId: number) {
    return "userbots_sessions/" + userId.toString();
}
export async function newTelegramClient(userId: number) {
    const cachedClient = userbotsPool[userId];
    if (cachedClient) {
        return cachedClient;
    }

    const storeSession = new StoreSession(getSessionName(userId));
    storeSession.setDC(2, "149.154.167.40", 443);
    storeSession.save();

    const clientMetaInfo = await getClientMetaInfo();
    const client = new TelegramClient(storeSession, env.API_ID, env.API_HASH, {
        connectionRetries: 5,
        useWSS: true,
        // testServers: true,
        // networkSocket: PromisedNetSockets,
        ...clientMetaInfo
    });

    userbotsPool[userId] = client;
    await client.connect();
    console.log("userbot-" + userId + " is connected");
    return client;
}

export async function sendCode(client: TelegramClient, phoneNumber: string) {
    await client.sendCode({ apiId: env.API_ID, apiHash: env.API_HASH }, phoneNumber);
}

// export async function sendCode(client: TelegramClient, phoneNumber: string) {
//     await client.sendCode({ apiId: env.API_ID, apiHash: env.API_HASH }, phoneNumber);
// }

// export async function startTelegramClient(client: TelegramClient, phoneNumber: string, password: string | undefined, phoneCodeR: Promise<string>) {
//     await client.start({
//         phoneNumber:  phoneNumber,
//         password: async () => password || "",
//         // phoneCode: async () => {
//         //     let code = await phoneCodeR;
//         //     console.log("phoneCode called " + code);
//         //     return code;
//         // },
//         phoneCode: async () => new Promise(async (resolve, reject) => {
//             //TODO: restart this Q&A if code not preceded with underscore
//             let msgAsk = await ctx.reply("Enter phone code received from telegram\n\
//                                         Precede with underscore! Example: *_00000*)", {
//                                     parse_mode:"MarkdownV2"
//                                 });
//             let answer = await conversation.waitFor(":text");
//             resolve(answer.msg.text);
//         }),
//         onError: async (err) => {
//             console.log(err);
//             return false;
//         },
//     });
//     console.log("Another client just started...");
// }



export async function setupClientHandlers(client: TelegramClient) {

    client.addEventHandler(async (event) => {
        const message = event.message;
        if ((event.isPrivate == undefined || event.isPrivate) && !event.isChannel && !event.isGroup) {
            // maybe will have to use session storage to get accessHash, 
            // because on 'sender' the accessHash is marked as not guaranteed to be there 
            // const UserInputInfo = storeSession.getInputEntity(event.message);

            const sender = await message.getSender() as Api.User;
            if (!sender) throw new Error();
            if (sender.bot) return;

            // basic way to stop client in case of emergency
            if (sender.self) {
                if (message.text == "stop") {
                    await client.sendMessage(
                        sender, {
                        message: 'disconnecting client!'
                    }
                    );
                    await client.disconnect();
                }

            }

            await client.sendMessage(
                env.CHANNEL_ID_TO_SAVE_MESSAGES, {
                message: `@${sender.username} | ${sender.id} | ${sender.accessHash}`
            }
            );
            await client.forwardMessages(env.CHANNEL_ID_TO_SAVE_MESSAGES, {
                messages: event.message,
                fromPeer: "me"
            })
        }
    }, new NewMessage({ incoming: true, blacklistChats: true }))

    client.addEventHandler(async (event) => {
        const message = event.message;
        if ((event.isPrivate == undefined || event.isPrivate) && !event.isChannel && !event.isGroup) {
            const sender = await message.getSender() as Api.User;

            if (!sender) throw new Error();
            if (sender.bot) return;

            await client.sendMessage(
                env.CHANNEL_ID_TO_SAVE_MESSAGES, {
                message: `edited message\n@${sender.username} | ${sender.id} | ${sender.accessHash}`
            }
            );
            await client.forwardMessages(env.CHANNEL_ID_TO_SAVE_MESSAGES, {
                messages: event.message,
                fromPeer: "me"
            })
        }
    }, new EditedMessage({ incoming: true, blacklistChats: true }))

}

