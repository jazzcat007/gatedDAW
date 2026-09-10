import {describe, it, expect} from "vitest"
// @ts-expect-error — the probe is deliberately plain JS with no declarations; it stays build-free.
import {wavInfo} from "../../../../../scripts/lib/wav-info.mjs"

const buildWav = (chunks: Array<{id: string, data: Buffer}>): Buffer => {
    let totalSize = 4
    for (const chunk of chunks) {
        const padding = chunk.data.length % 2 === 1 ? 1 : 0
        totalSize += 8 + chunk.data.length + padding
    }
    const result = Buffer.alloc(8 + totalSize)
    result.write("RIFF")
    result.writeUInt32LE(totalSize, 4)
    result.write("WAVE", 8)
    let offset = 12
    for (const chunk of chunks) {
        result.write(chunk.id, offset, "ascii")
        result.writeUInt32LE(chunk.data.length, offset + 4)
        chunk.data.copy(result, offset + 8)
        const padding = chunk.data.length % 2 === 1 ? 1 : 0
        offset += 8 + chunk.data.length + padding
    }
    return result
}

const createFmtChunk = (channels: number, sampleRate: number, bitsPerSample: number, audioFormat = 1): Buffer => {
    const buffer = Buffer.alloc(16)
    buffer.writeUInt16LE(audioFormat, 0)
    buffer.writeUInt16LE(channels, 2)
    buffer.writeUInt32LE(sampleRate, 4)
    const byteRate = sampleRate * channels * (bitsPerSample / 8)
    buffer.writeUInt32LE(byteRate, 8)
    buffer.writeUInt16LE(channels * (bitsPerSample / 8), 12)
    buffer.writeUInt16LE(bitsPerSample, 14)
    return buffer
}

const createDataChunk = (frames: number, channels: number, bitsPerSample: number): Buffer => {
    const sizeInBytes = frames * channels * (bitsPerSample / 8)
    return Buffer.alloc(sizeInBytes)
}

describe("wavInfo", () => {
    it("parses 16-bit stereo 44100 Hz WAV", () => {
        const fmtChunk = createFmtChunk(2, 44100, 16)
        const dataChunk = createDataChunk(44100, 2, 16)
        const wav = buildWav([
            {id: "fmt ", data: fmtChunk},
            {id: "data", data: dataChunk}
        ])
        const info = wavInfo(wav)
        expect(info.channels).toBe(2)
        expect(info.sampleRate).toBe(44100)
        expect(info.bitsPerSample).toBe(16)
        expect(info.numberOfFrames).toBe(44100)
        expect(info.durationInSeconds).toBe(1)
    })

    it("parses 8-bit mono 22050 Hz WAV", () => {
        const fmtChunk = createFmtChunk(1, 22050, 8)
        const dataChunk = createDataChunk(22050, 1, 8)
        const wav = buildWav([
            {id: "fmt ", data: fmtChunk},
            {id: "data", data: dataChunk}
        ])
        const info = wavInfo(wav)
        expect(info.channels).toBe(1)
        expect(info.sampleRate).toBe(22050)
        expect(info.bitsPerSample).toBe(8)
        expect(info.numberOfFrames).toBe(22050)
        expect(info.durationInSeconds).toBe(1)
    })

    it("parses 24-bit stereo 48000 Hz WAV", () => {
        const fmtChunk = createFmtChunk(2, 48000, 24)
        const dataChunk = createDataChunk(48000, 2, 24)
        const wav = buildWav([
            {id: "fmt ", data: fmtChunk},
            {id: "data", data: dataChunk}
        ])
        const info = wavInfo(wav)
        expect(info.channels).toBe(2)
        expect(info.sampleRate).toBe(48000)
        expect(info.bitsPerSample).toBe(24)
        expect(info.numberOfFrames).toBe(48000)
        expect(info.durationInSeconds).toBe(1)
    })

    it("parses 32-bit IEEE float WAV", () => {
        const fmtChunk = createFmtChunk(2, 48000, 32, 3)
        const dataChunk = createDataChunk(48000, 2, 32)
        const wav = buildWav([
            {id: "fmt ", data: fmtChunk},
            {id: "data", data: dataChunk}
        ])
        const info = wavInfo(wav)
        expect(info.channels).toBe(2)
        expect(info.bitsPerSample).toBe(32)
        expect(info.numberOfFrames).toBe(48000)
        expect(info.durationInSeconds).toBe(1)
    })

    it("parses WAVE_FORMAT_EXTENSIBLE", () => {
        const fmtChunk = createFmtChunk(2, 48000, 24, 0xFFFE)
        const dataChunk = createDataChunk(48000, 2, 24)
        const wav = buildWav([
            {id: "fmt ", data: fmtChunk},
            {id: "data", data: dataChunk}
        ])
        const info = wavInfo(wav)
        expect(info.bitsPerSample).toBe(24)
        expect(info.numberOfFrames).toBe(48000)
    })

    it("walks through LIST chunk before data", () => {
        const listData = Buffer.alloc(100)
        const fmtChunk = createFmtChunk(2, 44100, 16)
        const dataChunk = createDataChunk(44100, 2, 16)
        const wav = buildWav([
            {id: "LIST", data: listData},
            {id: "fmt ", data: fmtChunk},
            {id: "data", data: dataChunk}
        ])
        const info = wavInfo(wav)
        expect(info.numberOfFrames).toBe(44100)
    })

    it("handles odd-sized chunk with padding", () => {
        const oddData = Buffer.alloc(99)
        const fmtChunk = createFmtChunk(2, 44100, 16)
        const dataChunk = createDataChunk(44100, 2, 16)
        const wav = buildWav([
            {id: "JUNK", data: oddData},
            {id: "fmt ", data: fmtChunk},
            {id: "data", data: dataChunk}
        ])
        const info = wavInfo(wav)
        expect(info.numberOfFrames).toBe(44100)
    })

    it("calculates fractional duration correctly", () => {
        const fmtChunk = createFmtChunk(2, 48000, 16)
        const dataChunk = createDataChunk(44100, 2, 16)
        const wav = buildWav([
            {id: "fmt ", data: fmtChunk},
            {id: "data", data: dataChunk}
        ])
        const info = wavInfo(wav)
        expect(info.numberOfFrames).toBe(44100)
        expect(info.durationInSeconds).toBe(44100 / 48000)
    })

    it("throws for non-RIFF file", () => {
        const buffer = Buffer.alloc(12)
        buffer.write("NOTF")
        buffer.write("WAVE", 8)
        expect(() => wavInfo(buffer)).toThrow("Not a RIFF file")
    })

    it("throws for non-WAVE file", () => {
        const buffer = Buffer.alloc(12)
        buffer.write("RIFF")
        buffer.write("NOTW", 8)
        expect(() => wavInfo(buffer)).toThrow("Not a WAVE file")
    })

    it("throws for file too short", () => {
        const buffer = Buffer.from([1, 2, 3])
        expect(() => wavInfo(buffer)).toThrow("WAV file too short")
    })

    it("throws for missing fmt chunk", () => {
        const dataChunk = createDataChunk(44100, 2, 16)
        const wav = buildWav([
            {id: "data", data: dataChunk}
        ])
        expect(() => wavInfo(wav)).toThrow("Missing fmt chunk")
    })

    it("throws for missing data chunk", () => {
        const fmtChunk = createFmtChunk(2, 44100, 16)
        const wav = buildWav([
            {id: "fmt ", data: fmtChunk}
        ])
        expect(() => wavInfo(wav)).toThrow("Missing data chunk")
    })

    it("throws for zero channels", () => {
        const fmtChunk = createFmtChunk(0, 44100, 16)
        const dataChunk = createDataChunk(44100, 1, 16)
        const wav = buildWav([
            {id: "fmt ", data: fmtChunk},
            {id: "data", data: dataChunk}
        ])
        expect(() => wavInfo(wav)).toThrow("Invalid channel count: 0")
    })

    it("throws for zero sample rate", () => {
        const fmtChunk = createFmtChunk(2, 0, 16)
        const dataChunk = createDataChunk(44100, 2, 16)
        const wav = buildWav([
            {id: "fmt ", data: fmtChunk},
            {id: "data", data: dataChunk}
        ])
        expect(() => wavInfo(wav)).toThrow("Invalid sample rate: 0")
    })

    it("throws for zero bits per sample", () => {
        const fmtChunk = createFmtChunk(2, 44100, 0)
        const dataChunk = createDataChunk(44100, 2, 16)
        const wav = buildWav([
            {id: "fmt ", data: fmtChunk},
            {id: "data", data: dataChunk}
        ])
        expect(() => wavInfo(wav)).toThrow("Invalid bits per sample: 0")
    })

    it("throws for unsupported audio format", () => {
        const fmtChunk = createFmtChunk(2, 44100, 16, 2)
        const dataChunk = createDataChunk(44100, 2, 16)
        const wav = buildWav([
            {id: "fmt ", data: fmtChunk},
            {id: "data", data: dataChunk}
        ])
        expect(() => wavInfo(wav)).toThrow("Unsupported audio format: 2")
    })

    it("throws for truncated chunk header", () => {
        const buffer = Buffer.alloc(14)
        buffer.write("RIFF")
        buffer.write("WAVE", 8)
        expect(() => wavInfo(buffer)).toThrow("Truncated chunk header")
    })

    it("throws for chunk payload running past end", () => {
        const buffer = Buffer.alloc(20)
        buffer.write("RIFF")
        buffer.writeUInt32LE(100, 4)
        buffer.write("WAVE", 8)
        buffer.write("fmt ", 12)
        buffer.writeUInt32LE(100, 16)
        expect(() => wavInfo(buffer)).toThrow("Chunk payload runs past end of file")
    })

    it("throws for 0xFFFFFFFF data size (streaming)", () => {
        const buffer = Buffer.alloc(52)
        buffer.write("RIFF")
        buffer.writeUInt32LE(44, 4)
        buffer.write("WAVE", 8)
        buffer.write("fmt ", 12)
        buffer.writeUInt32LE(16, 16)
        buffer.writeUInt16LE(1, 20)
        buffer.writeUInt16LE(2, 22)
        buffer.writeUInt32LE(44100, 24)
        buffer.writeUInt32LE(176400, 28)
        buffer.writeUInt16LE(4, 32)
        buffer.writeUInt16LE(16, 34)
        buffer.write("data", 36)
        buffer.writeUInt32LE(0xFFFFFFFF, 40)
        expect(() => wavInfo(buffer)).toThrow("Streaming WAV (0xFFFFFFFF size) not supported")
    })
})
