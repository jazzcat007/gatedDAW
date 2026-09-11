import css from "./AdminPage.sass?inline"
import {createElement, PageContext, PageFactory, replaceChildren} from "@opendaw/lib-jsx"
import {Bytes, Lifecycle, Terminable} from "@opendaw/lib-std"
import {StudioService} from "@/service/StudioService.ts"
import {BackButton} from "@/ui/pages/BackButton"
import {Html} from "@opendaw/lib-dom"
import {AdminApi} from "@/admin/AdminApi"
import {Button} from "@/ui/components/Button"
import {Colors} from "@opendaw/studio-enums"

const className = Html.adoptStyleSheet(css, "AdminPage")

const formatDate = (iso: string | null): string => iso === null ? "—" : new Date(iso).toLocaleString()

const AccessDenied = ({service}: { service: StudioService }) => (
    <div className={className}>
        <BackButton service={service}/>
        <h1>Admin</h1>
        <p>You must be signed in as an admin to view this page.</p>
    </div>
)

const UsersSection = (lifecycle: Lifecycle, currentUserId: string,
                      initialUsers: ReadonlyArray<AdminApi.User>): HTMLElement => {
    const errorLine: HTMLElement = <div className="error"/>
    const body: HTMLTableSectionElement = <tbody/>
    const showError = (reason: unknown) =>
        errorLine.textContent = reason instanceof Error ? reason.message : String(reason)

    const reload = async () => {
        errorLine.textContent = ""
        try {
            renderRows(await AdminApi.listUsers())
        } catch (reason) {
            showError(reason)
        }
    }

    const renderRow = (user: AdminApi.User): HTMLTableRowElement => {
        const isSelf = user.id === currentUserId
        const disabled = user.disabledAt !== null
        const roleSelect: HTMLSelectElement = (
            <select disabled={isSelf}>
                <option value="member" selected={user.role === "member"}>member</option>
                <option value="admin" selected={user.role === "admin"}>admin</option>
            </select>
        ) as HTMLSelectElement
        roleSelect.addEventListener("change", async () => {
            try {
                await AdminApi.updateUser(user.id, {role: roleSelect.value as AdminApi.Role})
                await reload()
            } catch (reason) {
                showError(reason)
            }
        })
        return (
            <tr>
                <td>{user.username}{isSelf ? " (you)" : ""}</td>
                <td>{roleSelect}</td>
                <td>{disabled ? "disabled" : "active"}</td>
                <td>{formatDate(user.lastLoginAt)}</td>
                <td className="actions">
                    {isSelf ? null : (
                        <Button lifecycle={lifecycle} onClick={async () => {
                            try {
                                await AdminApi.updateUser(user.id, {disabled: !disabled})
                                await reload()
                            } catch (reason) {
                                showError(reason)
                            }
                        }} appearance={{color: disabled ? Colors.green : Colors.yellow}}>
                            {disabled ? "ENABLE" : "DISABLE"}
                        </Button>
                    )}
                    <Button lifecycle={lifecycle} onClick={async () => {
                        const password = prompt(`New password for '${user.username}' (min 8 characters):`)
                        if (password === null || password.length === 0) {return}
                        try {
                            await AdminApi.updateUser(user.id, {password})
                            await reload()
                        } catch (reason) {
                            showError(reason)
                        }
                    }} appearance={{color: Colors.cream}}>RESET PASSWORD</Button>
                    {isSelf ? null : (
                        <Button lifecycle={lifecycle} onClick={async () => {
                            if (!confirm(`Delete user '${user.username}'? This cannot be undone.`)) {return}
                            try {
                                await AdminApi.deleteUser(user.id)
                                await reload()
                            } catch (reason) {
                                showError(reason)
                            }
                        }} appearance={{color: Colors.red}}>DELETE</Button>
                    )}
                </td>
            </tr>
        )
    }

    const renderRows = (list: ReadonlyArray<AdminApi.User>) => replaceChildren(body, ...list.map(renderRow))
    renderRows(initialUsers)

    const usernameInput: HTMLInputElement = <input placeholder="Username" required minlength="3"/> as HTMLInputElement
    const passwordInput: HTMLInputElement =
        <input type="password" placeholder="Password (min 8 chars)" required minlength="8"/> as HTMLInputElement
    const roleInput: HTMLSelectElement = (
        <select>
            <option value="member" selected>member</option>
            <option value="admin">admin</option>
        </select>
    ) as HTMLSelectElement
    const createForm: HTMLFormElement = (
        <form className="create-user" onsubmit={async (event: Event) => {
            event.preventDefault()
            try {
                await AdminApi.createUser(usernameInput.value.trim(), passwordInput.value, roleInput.value as AdminApi.Role)
                usernameInput.value = ""
                passwordInput.value = ""
                await reload()
            } catch (reason) {
                showError(reason)
            }
        }}>
            {usernameInput}
            {passwordInput}
            {roleInput}
            <button type="submit">ADD USER</button>
        </form>
    ) as HTMLFormElement

    return (
        <section className="users">
            <h2>Users</h2>
            <table>
                <thead>
                <tr>
                    <th>Username</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Last Login</th>
                    <th/>
                </tr>
                </thead>
                {body}
            </table>
            {createForm}
            {errorLine}
        </section>
    )
}

const SettingsSection = (initialSettings: AdminApi.Settings): HTMLElement => {
    const errorLine: HTMLElement = <div className="error"/>
    const savedLine: HTMLElement = <div className="saved"/>
    const siteNameInput: HTMLInputElement = <input value={initialSettings.siteName} required/> as HTMLInputElement
    const dump: HTMLPreElement = <pre>{JSON.stringify(initialSettings, null, 2)}</pre> as HTMLPreElement
    const form: HTMLFormElement = (
        <form className="settings" onsubmit={async (event: Event) => {
            event.preventDefault()
            errorLine.textContent = ""
            savedLine.textContent = ""
            try {
                const settings = await AdminApi.updateSettings({siteName: siteNameInput.value.trim()})
                dump.textContent = JSON.stringify(settings, null, 2)
                savedLine.textContent = "Saved."
            } catch (reason) {
                errorLine.textContent = reason instanceof Error ? reason.message : String(reason)
            }
        }}>
            <label>Site Name<br/>{siteNameInput}</label>
            <button type="submit">SAVE</button>
            {savedLine}
        </form>
    ) as HTMLFormElement
    return (
        <section className="settings-section">
            <h2>Settings</h2>
            {form}
            {errorLine}
            <h3>Full Settings (read-only)</h3>
            {dump}
        </section>
    )
}

const jobText = (job: AdminApi.AssetImportJob | null): string => {
    if (job === null) {return "No asset import job has run since this server started."}
    return [
        `${job.status.toUpperCase()} ${job.command}`,
        `Started: ${formatDate(job.startedAt)}`,
        `Finished: ${formatDate(job.finishedAt)}`,
        job.error === null ? "" : `Error: ${job.error}`,
        "",
        job.output.trim()
    ].filter(line => line.length > 0).join("\n")
}

const AssetsSection = (lifecycle: Lifecycle, initialAssets: AdminApi.AssetsSummary): HTMLElement => {
    const errorLine: HTMLElement = <div className="error"/>
    const summaryLine: HTMLElement = <p className="asset-summary"/>
    const body: HTMLTableSectionElement = <tbody/>
    const jobOutput: HTMLPreElement = <pre className="job-output"/>
    const showError = (reason: unknown) =>
        errorLine.textContent = reason instanceof Error ? reason.message : String(reason)

    let currentAssets = initialAssets

    const renderJob = (job: AdminApi.AssetImportJob | null) => {
        jobOutput.textContent = jobText(job)
    }

    const renderRows = (assets: AdminApi.AssetsSummary) => {
        currentAssets = assets
        summaryLine.textContent = `Factory root: ${assets.root} · offline-only: ${assets.offlineOnly ? "on" : "off"}`
        replaceChildren(body, ...assets.catalogs.map(catalog => (
            <tr>
                <td>{catalog.label}</td>
                <td>{catalog.count.toLocaleString()}</td>
                <td>{Bytes.toString(catalog.size)}</td>
                <td>{formatDate(catalog.updatedAt)}</td>
                <td><a href={catalog.indexPath} target="_blank">index</a></td>
            </tr>
        )))
        renderJob(assets.currentJob)
    }

    const reload = async () => {
        errorLine.textContent = ""
        try {
            renderRows(await AdminApi.fetchAssets())
        } catch (reason) {
            showError(reason)
        }
    }

    const importButton: HTMLButtonElement = (
        <button type="button" onclick={async () => {
            errorLine.textContent = ""
            try {
                await AdminApi.importDemos(false)
                await reload()
            } catch (reason) {
                showError(reason)
            }
        }}>REFRESH DEMOS</button>
    ) as HTMLButtonElement
    const replaceButton: HTMLButtonElement = (
        <button type="button" onclick={async () => {
            if (!confirm("Replace all local demo metadata and bundles from upstream openDAW?")) {return}
            errorLine.textContent = ""
            try {
                await AdminApi.importDemos(true)
                await reload()
            } catch (reason) {
                showError(reason)
            }
        }}>REPLACE DEMOS</button>
    ) as HTMLButtonElement
    const refreshButton: HTMLButtonElement = (
        <button type="button" onclick={reload}>REFRESH STATUS</button>
    ) as HTMLButtonElement

    renderRows(initialAssets)
    const interval = setInterval(() => {
        if (currentAssets.currentJob?.status === "running") {
            void reload()
        }
    }, 2_500)
    lifecycle.own(Terminable.create(() => clearInterval(interval)))

    return (
        <section className="assets">
            <h2>Assets</h2>
            {summaryLine}
            <table>
                <thead>
                <tr>
                    <th>Catalog</th>
                    <th>Items</th>
                    <th>Size</th>
                    <th>Updated</th>
                    <th/>
                </tr>
                </thead>
                {body}
            </table>
            <div className="asset-actions">{refreshButton}{importButton}{replaceButton}</div>
            <h3>Latest Import Job</h3>
            {jobOutput}
            {errorLine}
        </section>
    )
}

// The server enforces the real guards (offline gate, id validation, free-space margin, single job);
// this client-side margin math only disables the button early so the admin sees the problem before
// clicking instead of after.
const PACK_MIN_FREE_BYTES = 5_000_000_000
const selectionFitsFreeSpace = (packs: ReadonlyArray<AdminApi.Pack>, freeBytes: number): boolean => {
    const total = packs.reduce((sum, pack) => sum + pack.rawSizeBytes, 0)
    const margin = Math.max(PACK_MIN_FREE_BYTES, 2 * packs.reduce((largest, pack) => Math.max(largest, pack.rawSizeBytes), 0))
    return freeBytes - total >= margin
}

const PacksSection = (lifecycle: Lifecycle, initialPacks: AdminApi.PacksSummary): HTMLElement => {
    const errorLine: HTMLElement = <div className="error"/>
    const summaryLine: HTMLElement = <p className="asset-summary"/>
    const body: HTMLTableSectionElement = <tbody/>
    const jobOutput: HTMLPreElement = <pre className="job-output"/>
    const showError = (reason: unknown) =>
        errorLine.textContent = reason instanceof Error ? reason.message : String(reason)

    let currentPacks = initialPacks
    let currentJob = initialPacks.currentJob
    const selected = new Set<string>()

    const installButton: HTMLButtonElement = (
        <button type="button" onclick={async () => {
            if (selected.size === 0) {return}
            const packIds = [...selected]
            if (!confirm(`Install ${packIds.length} content pack(s)? The server downloads and imports them now.`)) {return}
            errorLine.textContent = ""
            try {
                await AdminApi.installPacks(packIds)
                await reload()
            } catch (reason) {
                showError(reason)
                await reload()
            }
        }}>INSTALL SELECTED</button>
    ) as HTMLButtonElement

    const renderRows = (summary: AdminApi.PacksSummary) => {
        currentPacks = summary
        currentJob = summary.currentJob
        for (const id of [...selected]) {
            if (!summary.packs.some(pack => pack.id === id)) {selected.delete(id)}
        }
        summaryLine.textContent = `Free space: ${Bytes.toString(summary.freeBytes)} · pack installs: `
            + (summary.offlineInstallDisabled ? "disabled (offline-only mode)" : "enabled")
        replaceChildren(body, ...summary.packs.map(pack => {
            const checkbox: HTMLInputElement = (
                <input type="checkbox" disabled={!pack.installable} checked={selected.has(pack.id)}/>
            ) as HTMLInputElement
            checkbox.addEventListener("change", () => {
                if (checkbox.checked) {selected.add(pack.id)} else {selected.delete(pack.id)}
                updateInstallButton()
            })
            const status = !pack.installable
                ? `blocked — ${pack.blockedReason ?? "not installable"}`
                : pack.installed ? "installed" : "not installed"
            return (
                <tr>
                    <td>{pack.name}</td>
                    <td>{pack.kind}</td>
                    <td>{pack.genres.join(", ")}</td>
                    <td>{pack.license}</td>
                    <td>{Bytes.toString(pack.rawSizeBytes)}</td>
                    <td>{status}</td>
                    <td>{checkbox}</td>
                </tr>
            )
        }))
        jobOutput.textContent = jobText(currentJob)
        updateInstallButton()
    }

    const updateInstallButton = () => {
        const selection = currentPacks.packs.filter(pack => selected.has(pack.id))
        installButton.disabled = currentPacks.offlineInstallDisabled
            || selection.length === 0
            || !selectionFitsFreeSpace(selection, currentPacks.freeBytes)
    }

    const reload = async () => {
        errorLine.textContent = ""
        try {
            renderRows(await AdminApi.fetchPacks())
        } catch (reason) {
            showError(reason)
        }
    }

    const refreshButton: HTMLButtonElement = (
        <button type="button" onclick={reload}>REFRESH PACKS</button>
    ) as HTMLButtonElement

    renderRows(initialPacks)
    const interval = setInterval(() => {
        if (currentJob?.status === "running") {
            void reload()
        }
    }, 2_500)
    lifecycle.own(Terminable.create(() => clearInterval(interval)))

    return (
        <section className="packs">
            <h2>Content Packs</h2>
            {summaryLine}
            <table>
                <thead>
                <tr>
                    <th>Name</th>
                    <th>Kind</th>
                    <th>Genres</th>
                    <th>License</th>
                    <th>Size</th>
                    <th>Status</th>
                    <th/>
                </tr>
                </thead>
                {body}
            </table>
            <div className="asset-actions">{refreshButton}{installButton}</div>
            <h3>Latest Import Job</h3>
            {jobOutput}
            {errorLine}
        </section>
    )
}

const InvitesSection = (initialInvites: ReadonlyArray<AdminApi.Invite>): HTMLElement => {
    const errorLine: HTMLElement = <div className="error"/>
    const body: HTMLTableSectionElement = <tbody/>
    const showError = (reason: unknown) =>
        errorLine.textContent = reason instanceof Error ? reason.message : String(reason)

    const reload = async () => {
        errorLine.textContent = ""
        try {
            renderRows(await AdminApi.listInvites())
        } catch (reason) {
            showError(reason)
        }
    }

    const inviteUrl = (token: string): string => `${location.origin}/?invite=${token}`

    const renderRow = (invite: AdminApi.Invite): HTMLTableRowElement => {
        const expired = invite.expiresAt < Date.now()
        const status = invite.usedAt !== null ? "used" : expired ? "expired" : "open"
        const copyButton: HTMLButtonElement = (
            <button type="button" disabled={status !== "open"} onclick={() =>
                navigator.clipboard.writeText(inviteUrl(invite.token)).catch(() => {})}>COPY LINK</button>
        ) as HTMLButtonElement
        const revokeButton: HTMLButtonElement = (
            <button type="button" disabled={status !== "open"} onclick={async () => {
                if (!confirm("Revoke this invite link?")) {return}
                try {
                    await AdminApi.revokeInvite(invite.token)
                    await reload()
                } catch (reason) {
                    showError(reason)
                }
            }}>REVOKE</button>
        ) as HTMLButtonElement
        return (
            <tr>
                <td>{invite.role}</td>
                <td>{status}</td>
                <td>{formatDate(new Date(invite.expiresAt).toISOString())}</td>
                <td className="actions">{copyButton}{revokeButton}</td>
            </tr>
        )
    }

    const renderRows = (list: ReadonlyArray<AdminApi.Invite>) => replaceChildren(body, ...list.map(renderRow))
    renderRows(initialInvites)

    const roleInput: HTMLSelectElement = (
        <select>
            <option value="member" selected>member</option>
            <option value="admin">admin</option>
        </select>
    ) as HTMLSelectElement
    const expiryInput: HTMLInputElement =
        <input type="number" value="168" min="1" required/> as HTMLInputElement
    const createForm: HTMLFormElement = (
        <form className="create-invite" onsubmit={async (event: Event) => {
            event.preventDefault()
            try {
                const invite = await AdminApi.createInvite(roleInput.value as AdminApi.Role, Number(expiryInput.value))
                await navigator.clipboard.writeText(inviteUrl(invite.token)).catch(() => {})
                await reload()
            } catch (reason) {
                showError(reason)
            }
        }}>
            {roleInput}
            <label>Expires in (hours)<br/>{expiryInput}</label>
            <button type="submit">CREATE &amp; COPY LINK</button>
        </form>
    ) as HTMLFormElement

    return (
        <section className="invites">
            <h2>Invites</h2>
            <table>
                <thead>
                <tr>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Expires</th>
                    <th/>
                </tr>
                </thead>
                {body}
            </table>
            {createForm}
            {errorLine}
        </section>
    )
}

export const AdminPage: PageFactory<StudioService> = async ({service, lifecycle}: PageContext<StudioService>) => {
    const me = await AdminApi.me()
    if (!me.authenticated || me.user?.role !== "admin") {
        return AccessDenied({service})
    }
    const {settings, users} = await AdminApi.fetchSettings()
    const invites = await AdminApi.listInvites()
    const assets = await AdminApi.fetchAssets()
    const packs = await AdminApi.fetchPacks()
    return (
        <div className={className}>
            <BackButton service={service}/>
            <h1>Admin</h1>
            <p className="signed-in-as">Signed in as <strong>{me.user.username}</strong> (admin)</p>
            <div className="sections">
                {UsersSection(lifecycle, me.user.id, users)}
                {InvitesSection(invites)}
                {AssetsSection(lifecycle, assets)}
                {PacksSection(lifecycle, packs)}
                {SettingsSection(settings)}
            </div>
        </div>
    )
}
