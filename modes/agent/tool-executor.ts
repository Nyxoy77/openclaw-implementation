import fs from 'node:fs'
import path from 'node:path'
import { homedir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { file } from 'bun';
import type { ActionTracker } from './action-tracker';
import type { AgentConfig } from './types';

const TEXT_EXT = new Set([
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".json",
    ".md",
    ".mdx",
    ".css",
    ".html",
    ".yml",
    ".yaml",
    ".toml",
    ".txt",
]);

function isProbablyTextFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return TEXT_EXT.has(ext) || ext === "";
}

export class ToolExecutor {
    private overlay = new Map<string, string>();
    private deleted = new Set<string>();
    private readonly norm = (rel: string) =>
        path.posix.normalize(rel.split(path.sep).join("/")).replace(/^\.\//, "");

    constructor(
        private readonly tracker: ActionTracker,
        private readonly config: AgentConfig
    ) { }

    /**
 * Resolves a user-supplied relative path into an absolute path while ensuring
 * it never escapes the configured workspace directory.
 *
 * Why is this needed?
 * -------------------
 * If we simply joined the workspace path with the user input, a malicious or
 * accidental path such as "../../../etc/passwd" could resolve to files outside
 * the project. This is known as a Path Traversal attack.
 *
 * How it works:
 * 1. Convert the supplied relative path into an absolute path using the
 *    workspace as the base directory.
 *
 *      Workspace: /home/project
 *      Input:     src/index.ts
 *      Result:    /home/project/src/index.ts
 *
 *      Workspace: /home/project
 *      Input:     ../../../etc/passwd
 *      Result:    /etc/passwd
 *
 * 2. Compute the relative path from the workspace root to the resolved path
 *    using path.relative().
 *
 *      path.relative("/home/project", "/home/project/src/index.ts")
 *          -> "src/index.ts"
 *
 *      path.relative("/home/project", "/etc/passwd")
 *          -> "../../../etc/passwd"
 *
 * 3. If the relative path begins with "..", the resolved file lies outside
 *    the workspace. Reject it by throwing an error.
 *
 * 4. path.isAbsolute(relCheck) is an additional safety check for platform-
 *    specific edge cases (e.g. different Windows drive letters) where the
 *    computed relative path may still represent an absolute location.
 *
 * If all checks pass, the function returns a safe absolute path guaranteed
 * to reside inside the configured workspace.
 */
    private resolveSafe(rel: string): string {
        const abs = path.resolve(this.config.codebasePath, rel);
        const root = path.resolve(this.config.codebasePath);
        const relCheck = path.relative(root, abs);
        if (relCheck.startsWith("..") || path.isAbsolute(relCheck)) {
            throw new Error(`Path escapes workspace: ${rel}`);
        }
        return abs;
    }

    /**
 * Determines whether a file or directory should be ignored based on the
 * configured exclusion patterns.
 *
 * The input path is first normalized (e.g. converts '\' to '/' and removes
 * redundant separators) so that matching behaves consistently across
 * operating systems.
 *
 * Matching rules:
 * 1. Split the normalized path into directory segments and extract the base
 *    filename.
 *
 *      "src/utils/file.ts"
 *          segments -> ["src", "utils", "file.ts"]
 *          base     -> "file.ts"
 *
 * 2. Iterate through each exclusion pattern.
 *
 *    - "*.log"
 *        Ignore any file whose name ends with ".log".
 *
 *    - ".env*"
 *        Ignore any file beginning with ".env"
 *        (e.g. .env, .env.local, .env.production).
 *
 *    - Other wildcard patterns containing '*'
 *        Currently skipped because only the above wildcard patterns are
 *        explicitly supported.
 *
 *    - Exact directory/file names
 *        Ignore the path if:
 *          • any path segment matches the pattern
 *          • the entire path matches the pattern
 *          • the path is inside a directory matching the pattern
 *
 *        Example:
 *            Pattern: "node_modules"
 *
 *            node_modules/index.js        -> excluded
 *            src/node_modules/a.js        -> excluded
 *            node_modules                 -> excluded
 *
 * Returns:
 *      true  -> path should be excluded
 *      false -> path is allowed
 */

    private excluded(relPath: string): boolean {
        const norm = this.norm(relPath);
        const segments = norm.split("/");
        const base = segments[segments.length - 1] ?? "";

        for (const pat of this.config.excludePatterns) {
            if (pat === "*.log" && base.endsWith(".log")) return true;
            if (pat === ".env*" && base.startsWith(".env")) return true;
            if (pat.includes("*")) continue;
            if (segments.includes(pat) || norm === pat || norm.startsWith(`${pat}/`))
                return true;
        }
        return false;
    }

    private assertNotExcluded(rel: string, op: string): void {
        if (this.excluded(rel)) {
            throw new Error(`${op}: path is excluded by policy: ${rel}`);
        }
    }

    //Finds edited files stored data if stored in memory if it finds then it returns else read it from the disk
    getEffectiveText(rel: string): string | undefined {
        const key = this.norm(rel);
        if (this.deleted.has(key)) return undefined;
        if (this.overlay.has(key)) return this.overlay.get(key);
        const abs = this.resolveSafe(rel);
        if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return undefined;
        return fs.readFileSync(abs, "utf8");
    }

    readFile(rel: string): string {
        this.assertNotExcluded(rel, "read_file");
        const abs = this.resolveSafe(rel);
        if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
            throw new Error(`File not found: ${rel}`);
        }
        const st = fs.statSync(abs);
        if (st.size > this.config.maxFileSizeToRead) {
            throw new Error(`File too large: ${rel}`);
        }
        const text = fs.readFileSync(abs, "utf8");
        this.tracker.log({
            type: "code_analysis",
            path: this.norm(rel),
            details: { after: text, toolName: "read_file" },
            status: "executed",
        });
        return text;
    }

    createFile(rel: string, content: string): string {
        if (!this.config.tools.allowFileCreation)
            throw new Error("File creation disabled");
        this.assertNotExcluded(rel, "create_file");
        const key = this.norm(rel);
        const abs = this.resolveSafe(rel);
        if (fs.existsSync(abs) && !this.deleted.has(key)) {
            throw new Error(`create_file: already exists: ${rel}`);
        }
        this.deleted.delete(key);
        this.overlay.set(key, content);
        this.tracker.log({
            type: "file_create",
            path: key,
            details: { after: content },
            status: "pending",
        });
        return `Staged new file: ${key}`;
    }

    modifyFile(rel: string, content: string): string {
        if (!this.config.tools.allowFileModification)
            throw new Error("File modification disabled");
        this.assertNotExcluded(rel, "modify_file");
        const before = this.getEffectiveText(rel);
        if (before === undefined)
            throw new Error(`modify_file: file not found: ${rel}`);
        const key = this.norm(rel);
        this.overlay.set(key, content);
        this.tracker.log({
            type: "file_modify",
            path: key,
            details: { before, after: content },
            status: "pending",
        });
        return `Staged update: ${key}`;
    }

    deleteFile(rel: string): string {
        if (!this.config.tools.allowFileModification)
            throw new Error("File deletion disabled");
        this.assertNotExcluded(rel, "delete_file");
        const before = this.getEffectiveText(rel);
        if (before === undefined)
            throw new Error(`delete_file: file not found: ${rel}`);
        const key = this.norm(rel);
        this.overlay.delete(key);
        this.deleted.add(key);
        this.tracker.log({
            type: "file_delete",
            path: key,
            details: { before },
            status: "pending",
        });
        return `Staged delete: ${key}`;
    }

    createFolder(rel: string): string {
        if (!this.config.tools.allowFolderCreation)
            throw new Error("Folder creation disabled");
        this.assertNotExcluded(rel, "create_folder");
        const key = this.norm(rel);
        this.tracker.log({
            type: "folder_create",
            path: key,
            details: { after: key },
            status: "pending",
        });
        return `Staged folder: ${key}`;
    }

    listFiles(rel: string, recursive: boolean): string {
        this.assertNotExcluded(rel, "list_files");
        const abs = this.resolveSafe(rel);
        if (!fs.existsSync(abs)) throw new Error(`list_files: not found: ${rel}`);

        const lines: string[] = [];
        const walk = (dir: string, prefix: string) => {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const ent of entries) {
                const full = path.join(dir, ent.name);
                const relP = path.relative(this.config.codebasePath, full);
                if (this.excluded(relP)) continue;
                if (ent.isDirectory()) {
                    lines.push(`${prefix}${ent.name}/`);
                    if (recursive) walk(full, `${prefix}${ent.name}/`);
                } else {
                    lines.push(`${prefix}${ent.name}`);
                }
            }
        };

        if (fs.statSync(abs).isDirectory()) walk(abs, "");
        else lines.push(path.relative(this.config.codebasePath, abs));

        const out = lines.sort().join("\n");
        this.tracker.log({
            type: "code_analysis",
            path: this.norm(rel),
            details: { after: out, toolName: "list_files" },
            status: "executed",
        });
        return out || "(empty)";
    }

    searchFiles(
        rootRel: string,
        globPattern: string,
        contentQuery?: string,
    ): string {
        this.assertNotExcluded(rootRel, "search_files");
        const rootAbs = this.resolveSafe(rootRel);
        if (!fs.existsSync(rootAbs))
            throw new Error(`search_files: root not found: ${rootRel}`);

        const results: string[] = [];
        const regexFromGlob = (g: string): RegExp => {
            const escaped = g
                .replace(/[.+^${}()|[\]\\]/g, "\\$&")
                .replace(/\*\*/g, "§§")
                .replace(/\*/g, "[^/\\\\]*")
                .replace(/§§/g, ".*")
                .replace(/\?/g, ".");
            return new RegExp(`^${escaped}$`, "i");
        };
        const nameRe = regexFromGlob(globPattern.replace(/\\/g, "/"));

        const walk = (dir: string) => {
            for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, ent.name);
                const relP = path
                    .relative(this.config.codebasePath, full)
                    .split(path.sep)
                    .join("/");
                if (this.excluded(relP)) continue;
                if (ent.isDirectory()) walk(full);
                else if (nameRe.test(relP) || nameRe.test(ent.name)) {
                    if (contentQuery) {
                        if (!isProbablyTextFile(full)) continue;
                        const text = fs.readFileSync(full, "utf8");
                        if (!text.includes(contentQuery)) continue;
                    }
                    results.push(relP);
                }
            }
        };

        if (fs.statSync(rootAbs).isDirectory()) walk(rootAbs);
        else {
            const relP = path
                .relative(this.config.codebasePath, rootAbs)
                .split(path.sep)
                .join("/");
            results.push(relP);
        }

        const out = [...new Set(results)].sort().join("\n");
        this.tracker.log({
            type: "code_analysis",
            path: this.norm(rootRel),
            details: { after: out || "(no matches)", toolName: "search_files" },
            status: "executed",
        });
        return out || "(no matches)";
    }

    queueShell(command: string): string {
        if (!this.config.tools.allowShellExecution)
            throw new Error("Shell execution disabled");
        this.tracker.log({
            type: "tool_execute",
            path: "shell",
            details: { command, toolName: "execute_shell" },
            status: "pending",
        });
        return `Shell queued: ${command}`;
    }
}