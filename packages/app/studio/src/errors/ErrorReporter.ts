import {BuildInfo} from "@/BuildInfo"

const CsrfHeader = {"X-OpenDAW-Csrf": "1"}

export type ClientErrorReport = {
    scope: string
    name: string
    message?: string
    stack?: string
    buildUuid: string
    buildEnv: string
    userAgent: string
    projectUuid?: string
    deviceType?: string
    action?: string
}

// Best-effort operational telemetry: a container's stdout only proves the static server started, not that
// the client-side engine ever initialized or processed anything. Without this, a silent client-side failure
// (no dialog, no exception surfaced to the user) is invisible to anyone who can only read `docker logs`.
// Must never throw or block the caller — a broken network path here must not become a second error.
export namespace ErrorReporter {
    export const submit = (report: ClientErrorReport): void => {
        fetch("/api/errors", {
            method: "POST",
            headers: {"Content-Type": "application/json", ...CsrfHeader},
            body: JSON.stringify(report)
        }).catch(() => {/* best-effort only */})
    }

    export const fromError = (scope: string, buildInfo: BuildInfo,
                              error: { name: string, message?: string, stack?: string },
                              context?: { projectUuid?: string, deviceType?: string, action?: string }): void =>
        submit({
            scope,
            name: error.name,
            message: error.message,
            stack: error.stack,
            buildUuid: buildInfo.uuid,
            buildEnv: buildInfo.env,
            userAgent: navigator.userAgent,
            ...context
        })
}
