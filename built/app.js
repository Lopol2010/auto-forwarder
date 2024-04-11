var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import os from 'os';
import { readFile } from "fs/promises";
import { TelegramClient } from "telegram";
import { StoreSession } from "telegram/sessions/index.js";
// @ts-ignore
import input from "input";
import env from './env.js';
import { NewMessage } from 'telegram/events/index.js';
import { EditedMessage } from 'telegram/events/EditedMessage.js';
const storeSession = new StoreSession("my_session");
(() => __awaiter(void 0, void 0, void 0, function* () {
    console.log("Initialization...");
    const filePath = new URL('../package.json', import.meta.url);
    const fileContentString = (yield readFile(filePath)).toString();
    const pkg = JSON.parse(fileContentString);
    const client = new TelegramClient(storeSession, env.API_ID, env.API_HASH, {
        connectionRetries: 5,
        deviceModel: `${pkg.name}@${os.hostname()}`,
        systemVersion: os.version() || 'Unknown',
        appVersion: pkg.version,
        useWSS: true,
        testServers: false,
    });
    console.log("Client connection...");
    yield client.connect();
    if (yield client.isUserAuthorized()) {
        console.log("Client authorized by stored session...");
    }
    else {
        console.log("Client authorization is required...");
        yield client.start({
            phoneNumber: () => __awaiter(void 0, void 0, void 0, function* () { return yield input.text("Please enter your number: "); }),
            password: () => __awaiter(void 0, void 0, void 0, function* () { return yield input.text("Please enter your password: "); }),
            phoneCode: () => __awaiter(void 0, void 0, void 0, function* () { return yield input.text("Please enter the code you received: "); }),
            onError: (err) => console.log(err),
        });
    }
    console.log("Client should be connected and authorized.");
    client.addEventHandler((event) => __awaiter(void 0, void 0, void 0, function* () {
        const message = event.message;
        if ((event.isPrivate == undefined || event.isPrivate) && !event.isChannel && !event.isGroup) {
            // maybe will have to use session storage to get accessHash, 
            // because on 'sender' the accessHash is marked as not guaranteed to be there 
            // const UserInputInfo = storeSession.getInputEntity(event.message);
            const sender = yield message.getSender();
            if (!sender)
                throw new Error();
            // basic way to stop client in case of emergency
            console.log("sender.self: ", sender);
            if (sender.self && message.text == "stop") {
                yield client.sendMessage(sender, {
                    message: 'disconnecting client!'
                });
                yield client.disconnect();
            }
            console.log("sender.id:", sender.id);
            yield client.sendMessage(env.CHANNEL_ID_TO_SAVE_MESSAGES, {
                message: `@${sender.username} | ${sender.id} | ${sender.accessHash}`
            });
            yield client.forwardMessages(env.CHANNEL_ID_TO_SAVE_MESSAGES, {
                messages: event.message,
                fromPeer: "me"
            });
        }
    }), new NewMessage({ incoming: true, blacklistChats: true }));
    client.addEventHandler((event) => __awaiter(void 0, void 0, void 0, function* () {
        const message = event.message;
        if ((event.isPrivate == undefined || event.isPrivate) && !event.isChannel && !event.isGroup) {
            const sender = yield message.getSender();
            yield client.sendMessage(env.CHANNEL_ID_TO_SAVE_MESSAGES, {
                message: `edited message\n@${sender.username} | ${sender.id} | ${sender.accessHash}`
            });
            yield client.forwardMessages(env.CHANNEL_ID_TO_SAVE_MESSAGES, {
                messages: event.message,
                fromPeer: "me"
            });
        }
    }), new EditedMessage({ incoming: true, blacklistChats: true }));
    // client.session.save();
}))();
