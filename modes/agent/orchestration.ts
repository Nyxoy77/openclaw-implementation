import chalk from "chalk";
import { isCancel, text } from "@clack/prompts";
import { defaultAgentConfig } from "./types";
import { ActionTracker } from "./action-tracker";

export async function runAgentMode() {
    console.log(chalk.bold('\n Agent Mode \n'));

    const goal = await text({
        message: "What would like the agent to do?",
        placeholder: "Concrete tasks for this codebase..",
    });

    if (isCancel(goal) || !goal.trim()) return;

    const config = defaultAgentConfig()
    const tracker = new ActionTracker() 
}