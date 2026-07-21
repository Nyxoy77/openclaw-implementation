#!/usr/bin/env bun

import { Command } from "commander";
import { runWakeup } from "./terminal_ui_Interface/wakeup";

const program = new Command()

program.name("openclaw").description("openclaw internal implementation").version("0.0.1")

program
    .command("Wakeup")
    .description("Wake up claw ")
    .action(async ()=>{
        await runWakeup()
    });

await program.parseAsync(process.argv)