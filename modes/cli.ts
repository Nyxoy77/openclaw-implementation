import { Chalk } from "chalk";
import { select, isCancel } from "@clack/prompts"
import { runWakeup } from "../terminal_ui_Interface/wakeup";
import { runAgentMode } from "./agent/orchestration";
import { runAskMode } from "./ask/orchestrator";
import { runPlanMode } from "./plan/orchestrator";

export async function runCliMode() {
    const mode = await select({
        message: "Chose CLI sub-mode",
        options: [
            { value: "agent", label: "Agent Mode" },
            { value: "plan", label: "Plan Mode" },
            { value: "ask", label: "Ask Mode" },
            { value: "back", label: "<- Back to main menu" }
        ]
    });

    if (mode === "back") {
        await runWakeup()
    }
    if (mode === "agent") {
        await runAgentMode()
    }
    if (mode === "ask") {
        await runAskMode()
    }
    if (mode === "plan") {
        await runPlanMode()
    }

    if (mode !== "agent" && mode !== "plan" && mode !== "ask") {
        // console.log(chalk.yellow("\nThat mode is not implemented yet.\n"));
    }
}
export async function runTelegramMode() { }