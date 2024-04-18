import os from 'os';
import { readFile } from "fs/promises";
import env from './env';
import { Bot, Context, MemorySessionStorage, NextFunction, SessionFlavor, session } from "grammy";
import { FileAdapter } from '@grammyjs/storage-file';
import { TelegramClient, client } from 'telegram';
import { hydrate, HydrateFlavor } from "@grammyjs/hydrate";
import { getSessionName, getClientForUserId, setupClientHandlers, clientsPool } from './clientsPool.js';
import { Config, JsonDB } from 'node-json-db';

const db = new JsonDB(new Config(`authorized-users-${env.NODE_ENV}`, true, true, '/'));
db.push("/ids", [], false);
export let authorizedUserIds = {
    async saveUserId(userId: number) {
        let isUserIdSaved = (await db.find<number>("/ids", entry => entry == userId)) != undefined;
        if (!isUserIdSaved) {
            db.push("/ids[]", userId)
        }
    },
    async getAll() {
        return await db.getData("/ids");

    }
};

