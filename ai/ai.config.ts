import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";

export function getAgentModel() {
    const provider = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });

    const modelId = process.env.OPENROUTER_DEFAULT_MODEL;

    if (!modelId) {
        throw new Error("OPENROUTER_DEFAULT_MODEL is not set");
    }

    return provider(modelId);
}

function gettext(prompt: string) {
    let provider = getAgentModel()

    return generateText({
        model: provider,
        prompt,
    })
}

let openRouterResponseObj = await gettext("What is the capital of india")
console.log(openRouterResponseObj.text)