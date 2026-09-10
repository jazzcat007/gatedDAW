// Header-only WAV probe: duration without decoding. Kept dependency-free because the SFZ importer that
// uses it must run on the deploy host without a built checkout.
export const wavInfo = bytes => {
    const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes)
    if (buffer.length < 12) {throw new Error("WAV file too short")}
    if (buffer.toString("ascii", 0, 4) !== "RIFF") {throw new Error("Not a RIFF file")}
    if (buffer.toString("ascii", 8, 12) !== "WAVE") {throw new Error("Not a WAVE file")}
    let format
    let dataSize
    let offset = 12
    while (offset < buffer.length) {
        if (offset + 8 > buffer.length) {throw new Error("Truncated chunk header")}
        const chunkId = buffer.toString("ascii", offset, offset + 4)
        const chunkSize = buffer.readUInt32LE(offset + 4)
        if (chunkId === "data" && chunkSize === 0xFFFFFFFF) {
            throw new Error("Streaming WAV (0xFFFFFFFF size) not supported")
        }
        const payload = offset + 8
        // A chunk declaring more bytes than the file actually holds is a common real-world defect: a
        // mis-sized or truncated final `data` chunk. Every real decoder — `decodeAudioData` included —
        // clamps to the bytes that are present rather than rejecting the file, so this does too. Being
        // stricter than the decoder that ultimately plays the sample only discards playable content
        // (it cost VCSL's four TX81Z instruments a whole import). A short chunk also ends the walk:
        // nothing after it can be a valid chunk header.
        const available = buffer.length - payload
        const truncated = chunkSize > available
        const usableSize = truncated ? available : chunkSize
        if (chunkId === "fmt ") {
            if (usableSize < 16) {throw new Error("fmt chunk too small")}
            format = {
                audioFormat: buffer.readUInt16LE(payload),
                channels: buffer.readUInt16LE(payload + 2),
                sampleRate: buffer.readUInt32LE(payload + 4),
                bitsPerSample: buffer.readUInt16LE(payload + 14)
            }
        } else if (chunkId === "data") {
            dataSize = usableSize
        }
        if (truncated) {break}
        offset = payload + chunkSize + (chunkSize % 2)
    }
    if (format === undefined) {throw new Error("Missing fmt chunk")}
    if (dataSize === undefined) {throw new Error("Missing data chunk")}
    const {audioFormat, channels, sampleRate, bitsPerSample} = format
    // 1 = PCM, 3 = IEEE float, 0xFFFE = WAVE_FORMAT_EXTENSIBLE (its fmt bitsPerSample stays authoritative).
    if (audioFormat !== 1 && audioFormat !== 3 && audioFormat !== 0xFFFE) {
        throw new Error(`Unsupported audio format: ${audioFormat}`)
    }
    if (channels === 0) {throw new Error("Invalid channel count: 0")}
    if (sampleRate === 0) {throw new Error("Invalid sample rate: 0")}
    if (bitsPerSample === 0) {throw new Error("Invalid bits per sample: 0")}
    const numberOfFrames = Math.floor(dataSize / (channels * bitsPerSample / 8))
    return {sampleRate, channels, bitsPerSample, numberOfFrames, durationInSeconds: numberOfFrames / sampleRate}
}
