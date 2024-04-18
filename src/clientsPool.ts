import os from 'os';
import { readFile } from "fs/promises";
import { Api, TelegramClient, password } from "telegram";
import { StoreSession } from "telegram/sessions/index.js";
import env from './env';
import { NewMessage, NewMessageEvent } from 'telegram/events/index.js';
import { EditedMessage } from 'telegram/events/EditedMessage.js';
import { authorizedUserIds } from './jsonDB';
import { LogLevel } from 'telegram/extensions/Logger';

export const clientsPool: { [index: string]: TelegramClient } = {}
const lastSender: {
    [clientUserId: string]: {
        chatId: string,
        username?: string,
        accessHash?: string,
    } | undefined
} = {}

export async function startAuthorizedClients() {
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

export function setupClientHandlers(client: TelegramClient) {

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
                    if(matchArr) {
                        let [, , userId, msgText] = matchArr;
                        await client.sendMessage(userId, { message: msgText });
                    }
                }
                return;
            }
            
            if (await isSenderChanged(client, sender)) {
                await client.sendMessage(env.CHANNEL_ID_TO_SAVE_MESSAGES, {
                    message: `${sender.username ? "@" + sender.username : "-"} | ${sender.id} | ${sender.accessHash}`
                });
            }
            await client.forwardMessages(env.CHANNEL_ID_TO_SAVE_MESSAGES, {
                messages: event.message,
                fromPeer: "me"
            })
        }
    }, new NewMessage({ incoming: true, blacklistChats: true }))

    client.addEventHandler(async (event) => {
        if (event.isPrivate) {

            const message = event.message;
            const sender = await message.getSender() as Api.User;
            if (!sender || sender.bot || sender.self) return;

            if (await isSenderChanged(client, sender)) {
                await client.sendMessage(env.CHANNEL_ID_TO_SAVE_MESSAGES, {
                    message: `edited message\n${sender.username ? "@" + sender.username : "-"} | ${sender.id} | ${sender.accessHash}`
                });
            }
            await client.forwardMessages(env.CHANNEL_ID_TO_SAVE_MESSAGES, {
                messages: event.message,
                fromPeer: "me"
            })
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
    return "client_sessions/" + userId.toString();
}