import { Chalk } from "chalk";
import { select, isCancel } from "@clack/prompts"
import { runWakeup } from "../terminal_ui_Interface/wakeup";

export async function runCliMode() {
    const modes = await select({
        message: "Chose CLI sub-mode",
        options:[
            {value:"agent",label:"Agent Mode"},
            {value:"plan",label:"Plan Mode"},
            {value:"ask",label:"Ask Mode"},
            {value:"back",label:"<- Back to main menu"}
        ]
    });

    if(modes === "back"){
        await runWakeup()
    }
}
export async function runTelegramMode() { }