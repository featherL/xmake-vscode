'use strict';

// imports
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as encoding from 'encoding';
import * as process from './process';
import { log } from './log';
import { config } from './config';

// the debugger class
export class Debugger implements vscode.Disposable {

    // the diagnostic collection
    private _diagnosticCollection: vscode.DiagnosticCollection;

    // the constructor
    constructor() {
    }

    // dispose
    public dispose() {
    }

    // find gdb path
    async findGdbPath() {
        var gdbPath = null;
        let findGdbScript = path.join(__dirname, `../../assets/find_gdb.lua`);
        if (fs.existsSync(findGdbScript)) {
            gdbPath = (await process.iorunv(config.executable, ["l", findGdbScript], {"COLORTERM": "nocolor"}, config.workingDirectory)).stdout.trim();
            if (gdbPath) {
                gdbPath = gdbPath.split('\n')[0].trim();
            }
        }
        return gdbPath? gdbPath : "";
    }

    // startDebugging
    async startDebugging(targetName?: string, targetProgram?: string, targetRunDir?: string, targetRunEnvs?: object, plat?: string) {

        // no target program?
        if (!targetProgram) {
            return;
        }

        // no target name? get it from target program
        if (!targetName) {
            targetName = path.basename(targetProgram);
        }

        // get target arguments
        let args = [];
        if (targetName in config.debuggingTargetsArguments)
            args = config.debuggingTargetsArguments[targetName];
        else if ("default" in config.debuggingTargetsArguments)
            args = config.debuggingTargetsArguments["default"];
        else if (targetName in config.runningTargetsArguments)
            args = config.runningTargetsArguments[targetName];
        else if ("default" in config.runningTargetsArguments)
            args = config.runningTargetsArguments["default"];

        // uses codelldb debugger?
        var codelldb = false;
        if (config.debugConfigType == "codelldb" || (os.platform() == "darwin" && vscode.extensions.getExtension("vadimcn.vscode-lldb"))) {
            codelldb = true;
        }

        // get target run directory
        if (!targetRunDir) {
            targetRunDir = path.dirname(targetProgram);
        }

        // get target run envs
        if (!targetRunEnvs) {
            targetRunEnvs = [];
        }

        // init debug configuration
        var debugConfig: vscode.DebugConfiguration = null
        if (codelldb) {
            /* convert environments
             * https://github.com/xmake-io/xmake-vscode/issues/139
             * https://github.com/vadimcn/vscode-lldb/blob/master/MANUAL.md#launching-a-new-process
             */
            var envs = {};
            for (let item of (targetRunEnvs as Array<Object>)) {
                let map = item as Map<String, String>;
                if (map) {
                    let name = map["name"];
                    let value = map["value"];
                    if (name && value) {
                        envs[name] = value;
                    }
                }
            }
            debugConfig = {
                name: `launch: ${targetName}`,
                type: 'lldb',
                request: 'launch',
                program: targetProgram,
                args: args,
                stopAtEntry: true,
                cwd: targetRunDir,
                env: envs,
                externalConsole: false,
            };
        } else {
            // uses cpptools debugger
            if (os.platform() == "darwin") {
                debugConfig = {
                    name: `launch: ${targetName}`,
                    type: 'cppdbg',
                    request: 'launch',
                    program: targetProgram,
                    args: args,
                    stopAtEntry: true,
                    cwd: targetRunDir,
                    environment: targetRunEnvs,
                    externalConsole: true,
                    MIMode: "lldb",
                    miDebuggerPath: ""
                };
            } else if (os.platform() == "linux") {
                debugConfig = {
                    name: `launch: ${targetName}`,
                    type: 'cppdbg',
                    request: 'launch',
                    program: targetProgram,
                    args: args,
                    stopAtEntry: true,
                    cwd: targetRunDir,
                    environment: targetRunEnvs,
                    externalConsole: false, // @see https://github.com/xmake-io/xmake-vscode/issues/36
                    MIMode: "gdb",
                    miDebuggerPath: await this.findGdbPath(),
                    setupCommands:[
                        {
                            description: "Enable pretty-printing for gdb",
                            text: "-enable-pretty-printing",
                            ignoreFailures: true
                        }
                    ]
                };
            } else if (os.platform() == "win32" && plat == "mingw") {
                debugConfig = {
                    name: `launch: ${targetName}`,
                    type: 'cppdbg',
                    request: 'launch',
                    program: targetProgram,
                    args: args,
                    stopAtEntry: true,
                    cwd: targetRunDir,
                    environment: targetRunEnvs,
                    externalConsole: false,
                    MIMode: "gdb",
                    miDebuggerPath: await this.findGdbPath(),
                    setupCommands:[
                        {
                            description: "Enable pretty-printing for gdb",
                            text: "-enable-pretty-printing",
                            ignoreFailures: true
                        }
                    ]
                    // description: "Enable pretty-printing for gdb",
                    // text: "-enable-pretty-printing",
                    // ignoreFailures: true
                };
            } else if (os.platform() == "win32") {
                debugConfig = {
                    name: `launch: ${targetName}`,
                    type: 'cppvsdbg',
                    request: 'launch',
                    program: targetProgram,
                    args: args,
                    stopAtEntry: true,
                    cwd: targetRunDir,
                    environment: targetRunEnvs,
                    // externalConsole: true, // https://github.com/microsoft/vscode-cpptools/issues/6939
                    // externalTerminal only supports cmd when debugging. https://github.com/microsoft/vscode/issues/147120
                    console: "internalConsole",
                    MIMode: "gdb",
                    miDebuggerPath: "",
                    setupCommands:[
                        {
                            description: "Enable pretty-printing for gdb",
                            text: "-enable-pretty-printing",
                            ignoreFailures: true
                        }
                    ]
                    // description: "Enable pretty-printing for gdb",
                    // text: "-enable-pretty-printing",
                    // ignoreFailures: true
                };
            }

        }

        var customcfg = config.customDebugConfig;
        for (let key in customcfg) {
            debugConfig[key] = customcfg[key];
        }
        // default type if not set yet
        debugConfig.type = debugConfig.type || 'cppdbg';

        // start debugging
        if (debugConfig) {
            await vscode.debug.startDebugging(vscode.workspace.workspaceFolders[0], debugConfig);
        }
    }
}
