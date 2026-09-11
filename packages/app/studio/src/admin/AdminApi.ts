import {panic} from "@opendaw/lib-std"

const CsrfHeader = {"X-OpenDAW-Csrf": "1"}

export namespace AdminApi {
    export type Role = "admin" | "member"
    export type User = {
        id: string
        username: string
        role: Role
        createdAt: string
        disabledAt: string | null
        lastLoginAt: string | null
    }
    export type Settings = { siteName: string } & Record<string, unknown>
    export type Me = { authenticated: boolean, setupRequired?: boolean, user?: { id: string, username: string, role: Role } }
    export type AssetCatalog = {
        id: "demos" | "samples" | "soundfonts" | "presets"
        label: string
        count: number
        size: number
        updatedAt: string | null
        indexPath: string
    }
    export type AssetImportJob = {
        id: string
        command: string
        status: "running" | "succeeded" | "failed"
        startedAt: string
        finishedAt: string | null
        exitCode: number | null
        output: string
        error: string | null
    }
    export type AssetsSummary = {
        root: string
        offlineOnly: boolean
        catalogs: ReadonlyArray<AssetCatalog>
        currentJob: AssetImportJob | null
    }

    const parseError = async (response: Response, fallback: string): Promise<string> =>
        (await response.json().catch(() => null))?.error ?? fallback

    export const me = async (): Promise<Me> => {
        const response = await fetch("/api/auth/me")
        return response.ok ? response.json() : {authenticated: false}
    }

    export const logout = async (): Promise<void> => {
        await fetch("/api/auth/logout", {method: "POST", headers: CsrfHeader})
    }

    export const changePassword = async (currentPassword: string, newPassword: string): Promise<void> => {
        const response = await fetch("/api/auth/password", {
            method: "POST",
            headers: {"Content-Type": "application/json", ...CsrfHeader},
            body: JSON.stringify({currentPassword, newPassword})
        })
        if (!response.ok) {return panic(await parseError(response, `Failed to change password (${response.status})`))}
    }

    export const fetchSettings = async (): Promise<{ settings: Settings, users: ReadonlyArray<User> }> => {
        const response = await fetch("/api/admin/settings")
        if (!response.ok) {return panic(await parseError(response, `Failed to load settings (${response.status})`))}
        return response.json()
    }

    export const updateSettings = async (patch: Partial<Settings>): Promise<Settings> => {
        const response = await fetch("/api/admin/settings", {
            method: "PUT",
            headers: {"Content-Type": "application/json", ...CsrfHeader},
            body: JSON.stringify(patch)
        })
        if (!response.ok) {return panic(await parseError(response, `Failed to update settings (${response.status})`))}
        const {settings} = await response.json()
        return settings
    }

    export const fetchAssets = async (): Promise<AssetsSummary> => {
        const response = await fetch("/api/admin/assets")
        if (!response.ok) {return panic(await parseError(response, `Failed to load assets (${response.status})`))}
        const {assets} = await response.json()
        return assets
    }

    export const importDemos = async (replace: boolean = false): Promise<AssetImportJob> => {
        const response = await fetch("/api/admin/assets/demos/import", {
            method: "POST",
            headers: {"Content-Type": "application/json", ...CsrfHeader},
            body: JSON.stringify({replace})
        })
        if (!response.ok) {return panic(await parseError(response, `Failed to start demo import (${response.status})`))}
        const {job} = await response.json()
        return job
    }

    export type Pack = {
        id: string
        kind: "sfz" | "soundfont"
        name: string
        genres: ReadonlyArray<string>
        license: string
        source: {type: string, url: string, ref?: string}
        sampleFormat?: string
        rawSizeBytes: number
        yields?: ReadonlyArray<string>
        installable: boolean
        blockedReason?: string
        installed: boolean
    }
    export type PacksSummary = {
        packs: ReadonlyArray<Pack>
        offlineInstallDisabled: boolean
        freeBytes: number
        currentJob: AssetImportJob | null
    }

    export const fetchPacks = async (): Promise<PacksSummary> => {
        const response = await fetch("/api/admin/factory/packs")
        if (!response.ok) {return panic(await parseError(response, `Failed to load content packs (${response.status})`))}
        return response.json()
    }

    export const installPacks = async (packIds: ReadonlyArray<string>): Promise<AssetImportJob> => {
        const response = await fetch("/api/admin/factory/packs/install", {
            method: "POST",
            headers: {"Content-Type": "application/json", ...CsrfHeader},
            body: JSON.stringify({packIds})
        })
        if (!response.ok) {return panic(await parseError(response, `Failed to start pack install (${response.status})`))}
        const {job} = await response.json()
        return job
    }

    export const listUsers = async (): Promise<ReadonlyArray<User>> => {
        const response = await fetch("/api/admin/users")
        if (!response.ok) {return panic(await parseError(response, `Failed to list users (${response.status})`))}
        const {users} = await response.json()
        return users
    }

    export const createUser = async (username: string, password: string, role: Role): Promise<User> => {
        const response = await fetch("/api/admin/users", {
            method: "POST",
            headers: {"Content-Type": "application/json", ...CsrfHeader},
            body: JSON.stringify({username, password, role})
        })
        if (!response.ok) {return panic(await parseError(response, `Failed to create user (${response.status})`))}
        const {user} = await response.json()
        return user
    }

    export const updateUser = async (id: string,
                                     patch: { role?: Role, disabled?: boolean, password?: string }): Promise<User> => {
        const response = await fetch(`/api/admin/users/${id}`, {
            method: "PUT",
            headers: {"Content-Type": "application/json", ...CsrfHeader},
            body: JSON.stringify(patch)
        })
        if (!response.ok) {return panic(await parseError(response, `Failed to update user (${response.status})`))}
        const {user} = await response.json()
        return user
    }

    export const deleteUser = async (id: string): Promise<void> => {
        const response = await fetch(`/api/admin/users/${id}`, {method: "DELETE", headers: CsrfHeader})
        if (!response.ok) {return panic(await parseError(response, `Failed to delete user (${response.status})`))}
    }

    export type Invite = {
        token: string
        role: Role
        createdBy: string
        createdAt: string
        expiresAt: number
        usedBy: string | null
        usedAt: string | null
    }

    export const listInvites = async (): Promise<ReadonlyArray<Invite>> => {
        const response = await fetch("/api/admin/invites")
        if (!response.ok) {return panic(await parseError(response, `Failed to list invites (${response.status})`))}
        const {invites} = await response.json()
        return invites
    }

    export const createInvite = async (role: Role, expiresInHours: number): Promise<Invite> => {
        const response = await fetch("/api/admin/invites", {
            method: "POST",
            headers: {"Content-Type": "application/json", ...CsrfHeader},
            body: JSON.stringify({role, expiresInHours})
        })
        if (!response.ok) {return panic(await parseError(response, `Failed to create invite (${response.status})`))}
        const {invite} = await response.json()
        return invite
    }

    export const revokeInvite = async (token: string): Promise<void> => {
        const response = await fetch(`/api/admin/invites/${token}`, {method: "DELETE", headers: CsrfHeader})
        if (!response.ok) {return panic(await parseError(response, `Failed to revoke invite (${response.status})`))}
    }
}
