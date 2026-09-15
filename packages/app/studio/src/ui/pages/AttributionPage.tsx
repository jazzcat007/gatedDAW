import css from "./AttributionPage.sass?inline"
import {createElement, JsxValue, PageContext, PageFactory} from "@opendaw/lib-jsx"
import {StudioService} from "@/service/StudioService.ts"
import {Html} from "@opendaw/lib-dom"
import {installScrollbars} from "@/ui/components/Scrollbars"

const className = Html.adoptStyleSheet(css, "AttributionPage")

const ExternalLink = ({href}: {readonly href: string}, children: JsxValue) => (
    <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
)

export const AttributionPage: PageFactory<StudioService> = ({lifecycle}: PageContext<StudioService>) => (
    <div className={className} onConnect={host => lifecycle.own(installScrollbars(host))}>
        <h1>Attribution</h1>
        <p>
            Metal-Duck Studio is built on open-source software and models. We are grateful to the people and projects
            whose work makes it possible.
        </p>

        <section>
            <h2>openDAW</h2>
            <p>
                Based on <ExternalLink href="https://github.com/andremichelle/openDAW">openDAW</ExternalLink>, created
                by André Michelle. This installation includes local modifications; the applicable source and licence
                notices are available with the project source.
            </p>
        </section>

        <section>
            <h2>Signalsmith Stretch</h2>
            <p>
                Time-stretching functionality includes Signalsmith Stretch by Geraint Luff / Signalsmith Audio Ltd.
                Copyright © 2022. Licensed under the MIT License.
            </p>
            <ExternalLink href="https://github.com/Signalsmith-Audio/signalsmith-stretch">Project source</ExternalLink>
        </section>

        <section>
            <h2>CTAGDRC compressor</h2>
            <p>
                The compressor is based on CTAG Dynamic Range Compressor (CTAGDRC), created by Phillip Lamp
                (Copyright © 2020), including look-ahead work by Daniel Rudrich (Copyright © 2019). The included port
                is licensed under GPL-3.0-or-later.
            </p>
            <ExternalLink href="https://github.com/p-hlp/CTAGDRC">CTAGDRC source</ExternalLink>
        </section>

        <section>
            <h2>Stem separation models</h2>
            <p>
                When enabled, stem separation uses an HTDemucs v4 ONNX export. The default model is from
                <ExternalLink href="https://huggingface.co/smank/htdemucs-onnx">smank/htdemucs-onnx</ExternalLink>
                &nbsp;(MIT); an optional alternative is from
                <ExternalLink href="https://huggingface.co/jackjiangxinfa/demucs-onnx">jackjiangxinfa/demucs-onnx</ExternalLink>
                &nbsp;(Apache-2.0). See each model repository for its complete licence and notices.
            </p>
        </section>

        <section>
            <h2>Other dependencies</h2>
            <p>
                This application also uses third-party open-source packages. Their names, versions, and declared
                licences are recorded in the distributed <code>package-lock.json</code> file.
            </p>
        </section>
    </div>
)
