import { cleanEnv, str, num } from "envalid";
// import { env } from "custom-env";
// env(true);
require("custom-env").env(true);

const env = cleanEnv (process.env, { 
    API_HASH: str(),
    CHANNEL_ID_TO_SAVE_MESSAGES: num(),
    API_ID: num(),
    BOT_TOKEN: str()
});

// console.log(env)

export default env;