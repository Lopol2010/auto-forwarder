import env from './env';
import { Bot, Composer, Context, MemorySessionStorage, NextFunction, SessionFlavor, session } from "grammy";
import { hydrate, HydrateFlavor } from "@grammyjs/hydrate";
import { getSessionName, getClientForUserId, setupClientHandlers, clientsPool } from './clientsPool.js';
import { authorizedUserIds } from './jsonDB';

interface SessionData {
    authParams: {
        authResolver: ((value: string) => void) | null
    },
}

export type MyContext = HydrateFlavor<Context> & SessionFlavor<SessionData>;

export const bot = new Bot<MyContext>(env.BOT_TOKEN, {
    client: {
        environment: env.NODE_ENV === "prod" ? "prod" : "test"
    }
});
