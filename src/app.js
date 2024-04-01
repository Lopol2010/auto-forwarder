import os from 'os';
import { readFile } from "fs/promises";
import { Api, TelegramClient } from "telegram";
import { StoreSession } from "telegram/sessions/index.js";
import input from "input";
import dotenv from 'dotenv';
import { NewMessage } from 'telegram/events/index.js';
import { EditedMessage } from 'telegram/events/EditedMessage.js';

dotenv.config();

const storeSession = new StoreSession("my_session"); // fill this later with the value from session.save()
const CHANNEL_ID_TO_SAVE_MESSAGES = Number.parseInt(process.env.CHANNEL_ID_TO_SAVE_MESSAGES);

(async () => {
    console.log("Initialization...");
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));
    const client = new TelegramClient(storeSession, Number.parseInt(process.env.API_ID), process.env.API_HASH, {
        connectionRetries: 5,
        deviceModel: `${pkg.name}@${os.hostname()}`,
        systemVersion: os.version() || 'Unknown',
        appVersion: pkg.version,
        useWSS: true,
        testServers: false,
    });

    console.log("Client connection...");
    await client.connect();
    if (await client.isUserAuthorized()) {
        console.log("Client authorized by stored session...");
    } else {
        console.log("Client authorization is required...");
        await client.start({
            phoneNumber: async () => await input.text("Please enter your number: "),
            password: async () => await input.text("Please enter your password: "),
            phoneCode: async () =>
                await input.text("Please enter the code you received: "),
            onError: (err) => console.log(err),
        });
    }
    console.log("Client should be connected and authorized.");

    client.addEventHandler(async (event) => {
        const message = event.message;
        if ((event.isPrivate == undefined || event.isPrivate) && !event.isChannel && !event.isGroup) {
            // maybe will have to use session storage to get accessHash, 
            // because on 'sender' the accessHash is marked as not guaranteed to be there 
            // const UserInputInfo = storeSession.getInputEntity(event.message);
            const sender = await message.getSender();

            // basic way to stop client in case of emergency
            if(sender.self && message.text == "stop") {
                await client.sendMessage(
                    sender, {
                        message: 'disconnecting client!'
                    } 
                );
                await client.disconnect();
            }

            await client.sendMessage(
                CHANNEL_ID_TO_SAVE_MESSAGES, {
                    message: `@${sender.username} | ${sender.id.value} | ${sender.accessHash?.value}`
                } 
            );
            await client.forwardMessages(CHANNEL_ID_TO_SAVE_MESSAGES, {
                messages: event.message,
            })
        }
    }, new NewMessage({ incoming: true, blacklistChats: true }))

    client.addEventHandler(async (event) => {
        const message = event.message;
        if ((event.isPrivate == undefined || event.isPrivate) && !event.isChannel && !event.isGroup) {
            const sender = await message.getSender();
            await client.sendMessage(
                CHANNEL_ID_TO_SAVE_MESSAGES, {
                    message: `edited message\n@${sender.username} | ${sender.id.value} | ${sender.accessHash?.value}`
                } 
            );
            await client.forwardMessages(CHANNEL_ID_TO_SAVE_MESSAGES, {
                messages: event.message,
            })
        }
    }, new EditedMessage({ incoming: true, blacklistChats: true }))

    // client.session.save();
})();