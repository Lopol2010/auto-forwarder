import dotenv from 'dotenv';
dotenv.config();
const env = {
    API_HASH: process.env.API_HASH || "",
    CHANNEL_ID_TO_SAVE_MESSAGES: Number.parseInt(process.env.CHANNEL_ID_TO_SAVE_MESSAGES || ""),
    API_ID: Number.parseInt(process.env.API_ID || "")
};
export default env;
