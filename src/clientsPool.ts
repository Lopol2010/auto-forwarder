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
            console.log(`is client-${id} authorized: ${await client.isUserAuthorized()}`);
        });
    })
}

export async function getClientForUserId(userId: number) {
    const cachedClient = clientsPool[userId];
    if (cachedClient) {
        return cachedClient;
    }

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
                await bot.api.sendMessage(
                    env.CHANNEL_ID_TO_SAVE_MESSAGES,
                    `${sender.username ? "@" + sender.username : "-"} | ${sender.id} | ${sender.accessHash}`
                ).catch(console.log);
            }

            if (message.text)
                await bot.api.sendMessage(env.CHANNEL_ID_TO_SAVE_MESSAGES, message.text).catch(console.log);


            const media = message.media;
            if (media) {

                await message.downloadMedia()
                    .then(async downloadedMedia => {
                        console.log("downloaded media of type " + media.className + " and length: " + downloadedMedia?.length);
                        if (downloadedMedia && downloadedMedia.length > 0) {
                            let inputFile = new InputFile(downloadedMedia);

                            if (media instanceof Api.MessageMediaPhoto) {
                                return bot.api.sendPhoto(env.CHANNEL_ID_TO_SAVE_MESSAGES, inputFile).catch(console.log)
                            } else if (media instanceof Api.MessageMediaDocument) {

                                if (media.video) {
                                    return bot.api.sendVideo(env.CHANNEL_ID_TO_SAVE_MESSAGES, inputFile).catch(console.log)
                                } else if (media.round) {
                                    return bot.api.sendVideoNote(env.CHANNEL_ID_TO_SAVE_MESSAGES, inputFile).catch(console.log)
                                } else if (media.voice) {
                                    return bot.api.sendVoice(env.CHANNEL_ID_TO_SAVE_MESSAGES, inputFile).catch(console.log)
                                } else if (media.document) {
                                    let document = media.document as Api.Document
                                    let attributes = document.attributes;
                                    let fileNameAttr = attributes.find((attr) => attr instanceof Api.DocumentAttributeFilename) as Api.DocumentAttributeFilename;
                                    let fileName: string;
                                    if (fileNameAttr) {
                                        fileName = fileNameAttr.fileName;
                                        console.log("uploading: " + fileName);
                                        inputFile = new InputFile(downloadedMedia, fileName);
                                    }
                                }
                            }
                            return bot.api.sendDocument(env.CHANNEL_ID_TO_SAVE_MESSAGES, inputFile).catch(console.log)
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
                await bot.api.sendMessage(
                    env.CHANNEL_ID_TO_SAVE_MESSAGES,
                    `${sender.username ? "@" + sender.username : "-"} | ${sender.id} | ${sender.accessHash}`
                ).catch(console.log);
            }

            if (message.text)
                await bot.api.sendMessage(env.CHANNEL_ID_TO_SAVE_MESSAGES, message.text).catch(console.log);
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