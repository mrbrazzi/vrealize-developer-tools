/*!
 * Copyright 2018-2020 VMware, Inc.
 * SPDX-License-Identifier: MIT
 */

import * as path from "path"

import { AutoWire, Logger } from "vrealize-common"
import * as vscode from "vscode"
import { determineActionType, Events, Packager } from "@vmware-pscoe/polyglotpkg"

import { Commands } from "../constants"
import { ConfigurationManager, EnvironmentManager } from "../system"
import { BaseVraCommand } from "./BaseVraCommand"
import { VraIdentityStore } from "../storage"

@AutoWire
export class PackagePolyglot extends BaseVraCommand {
    private readonly logger = Logger.get("PackagePolyglot")
    private packager: Packager
    private lastWorkspace: string

    get commandId(): string {
        return Commands.PackagePolyglot
    }

    constructor(env: EnvironmentManager, config: ConfigurationManager, identity: VraIdentityStore) {
        super(env, config, identity)
    }

    async execute(context: vscode.ExtensionContext): Promise<void> {
        this.logger.info("Executing command PackagePolyglot")

        if (!this.config.vrdev.experimental.polyglot) {
            vscode.window.showErrorMessage(
                "Interacting with Polyglot projects is experimental feature and " +
                    "must be enabled via the `vrdev.experimental.polyglot` setting"
            )
            return
        }

        if (this.env.workspaceFolders.length == 0) {
            this.logger.error("PackagePolyglot:execute() No opened workspace folders")
            return Promise.reject("There are no workspace folders opened in this window")
        }

        const workspaceFolder = await this.askForWorkspace("Select the workspace of the Polyglot/ABX package")
        this.logger.info(`Workspace folder: ${workspaceFolder.uri.fsPath}`)

        const actionType = await determineActionType(workspaceFolder.uri.fsPath)

        // create new packager only when needed
        if (!this.packager || this.lastWorkspace !== workspaceFolder.uri.fsPath) {
            this.lastWorkspace = workspaceFolder.uri.fsPath
            this.packager = new Packager({
                workspace: workspaceFolder.uri.fsPath,
                out: path.join(workspaceFolder.uri.fsPath, this.config.polyglotOut),
                bundle: path.join(workspaceFolder.uri.fsPath, this.config.polyglotBundle),
                vro: path.join(workspaceFolder.uri.fsPath, path.dirname(this.config.polyglotBundle), "vro"),
                skipVro: true,
                env: actionType,
                ...(this.logger.channel && { outputStream: this.logger.channel.raw() })
            })
        }

        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                cancellable: false
            },
            async progress => {
                this.packager.once(Events.COMPILE_START, () => {
                    progress.report({ message: "Compiling project..." })
                    this.logger.info("Compiling project...")
                })
                this.packager.once(Events.DEPENDENCIES_START, () => {
                    progress.report({ message: "Bundling dependencies..." })
                    this.logger.info("Bundling dependencies...")
                })
                this.packager.once(Events.BUNDLE_START, () => {
                    progress.report({ message: "Packaging project..." })
                    this.logger.info("Packaging project...")
                })
                await this.packager.packageProject()
            }
        )
    }
}
