import os from 'os';
import { readFile } from "fs/promises";
import { Api, TelegramClient, password } from "telegram";
import { StoreSession } from "telegram/sessions/index.js";
import env from './env';
import { NewMessage, NewMessageEvent } from 'telegram/events/index.js';
import { EditedMessage } from 'telegram/events/EditedMessage.js';
import { authorizedUserIds } from './jsonDB';
import { LogLevel } from 'telegram/extensions/Logger';
import { bot } from './bot';
import { InputFile, InputMediaBuilder } from 'grammy';
import { getAttributes, getFileInfo, getInputDocument, getInputPeer } from 'telegram/Utils';

export const clientsPool: { [index: string]: TelegramClient } = {}
const lastSender: {
    [clientUserId: string]: {
        chatId: string,
        username?: string,
        accessHash?: string,
    } | undefined
} = {}

export async function launchAllAuthorizedClients() {
    await authorizedUserIds.getAll().then((client_sessions: number[]) => {
        client_sessions.forEach(async (id, i) => {
            console.log("trying to restore client for: " + id);
            const client = await getClientForUserId(id);
            console.log(`client-${id} auth status is: ${await client.isUserAuthorized()}`);
        });
    })
}

export async function getClientForUserId(userId: number) {
    const cachedClient = clientsPool[userId];
    if (cachedClient) {
        return cachedClient;
    }

    // TODO: maybe should have different session names for dev and prod....
    const storeSession = new StoreSession(getSessionName(userId));

    storeSession.setDC(2, env.DC_IP, 443);
    storeSession.save();

    const clientDeviceInfo = await getDeviceInfo();
    const client = new TelegramClient(storeSession, env.API_ID, env.API_HASH, {
        connectionRetries: 5,
        useWSS: true,
        // testServers: true,
        // networkSocket: PromisedNetSockets,
        ...clientDeviceInfo
    });
    client.setLogLevel(LogLevel.ERROR);

    clientsPool[userId] = client;
    await client.connect();
    setupClientHandlers(client);
    console.log("user " + userId + " is connected");
    return client;
}

export async function setupClientHandlers(client: TelegramClient) {

    client.addEventHandler(async (event) => {
        if (event.isPrivate) {

            const message = event.message;
            const sender = await message.getSender() as Api.User;
            if (!sender || sender.bot) return;

            // basic way to stop client in case of emergency
            if (sender.self) {
                if (message.text == "stop") {
                    await client.sendMessage(sender, { message: 'disconnecting client!' });
                    await client.disconnect();
                } else if (message.text.startsWith("sendMessage")) {
                    let matchArr = message.text.match(/([^ ]*) ([^ ]*) (.*)/);
                    if (matchArr) {
                        let [, , userId, msgText] = matchArr;
                        await client.sendMessage(userId, { message: msgText });
                    }
                }
                return;
            }

            if (await isSenderChanged(client, sender)) {
                // TODO: message can contain a lot of stuff, including photos that are burn after viewed...
                //       probably would be good to handle as much cases as possible, not only text.
                //       maybe I could find solution in google and just copy it 
                bot.api.sendMessage(
                    env.CHANNEL_ID_TO_SAVE_MESSAGES,
                    `${sender.username ? "@" + sender.username : "-"} | ${sender.id} | ${sender.accessHash}`
                ).catch(console.log);
            }

            if (message.text)
                bot.api.sendMessage(env.CHANNEL_ID_TO_SAVE_MESSAGES, message.text).catch(console.log);


            const media = message.media;
            if (media) {

                // TODO: research Document and TypeDocumentAttribute
                //      maybe also research "file reference" of the document
                //      also look at altDocument 
                // TODO: research https://github.com/gram-js/gramjs/blob/0471403aa309522ab594d8b67c0bf6cd68ae8feb/gramjs/Utils.ts#L12
                //      and other function in Utils.ts
                //      see where and how they used in gramjs! maybe they're useful for me...
                message.downloadMedia()
                    .then(downloadedMedia => {
                        console.log("downloaded media of type " + media.className + " and length: " + downloadedMedia?.length);
                        if (downloadedMedia && downloadedMedia.length > 0) {
                            let inputFile = new InputFile(downloadedMedia);
                            
                            if (media instanceof Api.MessageMediaPhoto) {
                                bot.api.sendPhoto(env.CHANNEL_ID_TO_SAVE_MESSAGES, inputFile).catch(console.log)
                            } else if (media instanceof Api.MessageMediaDocument) {
                                if (media.video) {
                                    bot.api.sendVideo(env.CHANNEL_ID_TO_SAVE_MESSAGES, inputFile).catch(console.log)
                                } else if (media.round) {
                                    bot.api.sendVideoNote(env.CHANNEL_ID_TO_SAVE_MESSAGES, inputFile).catch(console.log)
                                } else if (media.voice) {
                                    bot.api.sendVoice(env.CHANNEL_ID_TO_SAVE_MESSAGES, inputFile).catch(console.log)
                                } else if (media.document) {
                                    let document = media.document as Api.Document
                                    let docType: string = "doc";
                                    let attributes = document.attributes;
                                    // export type TypeDocumentAttribute =
                                    //     | DocumentAttributeImageSize
                                    //     | DocumentAttributeAnimated
                                    //     | DocumentAttributeSticker
                                    //     | DocumentAttributeVideo
                                    //     | DocumentAttributeAudio
                                    //     | DocumentAttributeFilename
                                    //     | DocumentAttributeHasStickers
                                    //     | DocumentAttributeCustomEmoji;
                                    for (let attr of attributes) {
                                        if (attr instanceof Api.DocumentAttributeFilename) {
                                            // bot.api.sendMessage(env.CHANNEL_ID_TO_SAVE_MESSAGES, "fileName: " + attr.fileName).catch(console.log);
                                            inputFile = new InputFile(downloadedMedia, attr.fileName);
                                        } else if (attr instanceof Api.DocumentAttributeSticker) {
                                            docType = "sticker"
                                        }
                                        else if (attr instanceof Api.DocumentAttributeAnimated) {
                                            docType = "animated"
                                        }
                                    }
                                    if (docType == "sticker") {
                                        bot.api.sendSticker(env.CHANNEL_ID_TO_SAVE_MESSAGES, inputFile).catch(console.log)
                                    } else {
                                        bot.api.sendDocument(env.CHANNEL_ID_TO_SAVE_MESSAGES, inputFile).catch(console.log)
                                    }
                                } else {
                                    bot.api.sendDocument(env.CHANNEL_ID_TO_SAVE_MESSAGES, inputFile).catch(console.log)
                                }
                            }
                            else {
                                bot.api.sendDocument(env.CHANNEL_ID_TO_SAVE_MESSAGES, inputFile).catch(console.log)
                            }
                        }
                    })
                    .catch(console.log)
            }
        }
    }, new NewMessage({ incoming: true, blacklistChats: true }))

    client.addEventHandler(async (event) => {
        if (event.isPrivate) {

            const message = event.message;
            const sender = await message.getSender() as Api.User;
            if (!sender || sender.bot || sender.self) return;

            if (await isSenderChanged(client, sender)) {
                bot.api.sendMessage(
                    env.CHANNEL_ID_TO_SAVE_MESSAGES,
                    `${sender.username ? "@" + sender.username : "-"} | ${sender.id} | ${sender.accessHash}`
                ).catch(console.log);
            }

            if (message.text)
                bot.api.sendMessage(env.CHANNEL_ID_TO_SAVE_MESSAGES, message.text).catch(console.log);
        }
    }, new EditedMessage({ incoming: true, blacklistChats: true }))

}

async function isSenderChanged(client: TelegramClient, sender: Api.User) {

    const myId = (await client.getMe(true) as Api.InputPeerUser).userId.toString();
    const lastSenderInfo = lastSender[myId];
    if (lastSenderInfo) {

        const isSenderSame = lastSenderInfo.chatId == sender.id.toString() &&
            lastSenderInfo.username == sender.username &&
            lastSenderInfo.accessHash == sender.accessHash;

        if (isSenderSame) return false;
    }
    lastSender[myId] = {
        chatId: sender.id.toString(),
        username: sender.username,
        accessHash: sender.accessHash?.toString()
    }
    return true;
}

async function getDeviceInfo() {
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
    return `client-sessions-${userId.toString()}-${env.NODE_ENV}`;
}