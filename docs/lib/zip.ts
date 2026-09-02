/**
 * A minimal ZIP writer, store-only (no compression).
 *
 * Hand-rolled rather than pulled from npm on purpose: the archives here are a
 * handful of small text files, so DEFLATE buys nothing a reader would notice,
 * and a dependency in a docs site is a dependency someone has to keep patched.
 *
 * Output is deterministic -- every entry is stamped with the DOS epoch rather
 * than the current time -- so the same files always produce the same bytes and
 * a test can assert on them.
 */

const LOCAL_SIG = 0x04034b50
const CENTRAL_SIG = 0x02014b50
const EOCD_SIG = 0x06054b50

/** DOS epoch, 1980-01-01 00:00:00. Fixed so archives are reproducible. */
const DOS_TIME = 0
const DOS_DATE = (1 << 5) | 1

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[i] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export interface ZipEntry {
  /** Path inside the archive, e.g. "app/api/chat/route.ts". */
  name: string
  text: string
}

interface Prepared {
  nameBytes: Uint8Array
  data: Uint8Array
  crc: number
  offset: number
}

const LOCAL_HEADER = 30
const CENTRAL_HEADER = 46
const EOCD = 22

/**
 * Every entry is written twice -- once as a local header before its data, once
 * in the central directory at the end -- and the two copies must agree on the
 * CRC and both sizes. Tools that read only the central directory will happily
 * accept an archive that `unzip -t` rejects, and vice versa, so the values are
 * computed once per entry and reused for both.
 */
export function zipStore(entries: ZipEntry[]): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder()
  const prepared: Prepared[] = []

  let offset = 0
  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name)
    const data = encoder.encode(entry.text)
    prepared.push({ nameBytes, data, crc: crc32(data), offset })
    offset += LOCAL_HEADER + nameBytes.length + data.length
  }

  const centralStart = offset
  const centralSize = prepared.reduce(
    (sum, p) => sum + CENTRAL_HEADER + p.nameBytes.length,
    0,
  )

  const out = new Uint8Array(centralStart + centralSize + EOCD)
  const view = new DataView(out.buffer)
  let pos = 0

  const u16 = (value: number) => {
    view.setUint16(pos, value, true)
    pos += 2
  }
  const u32 = (value: number) => {
    view.setUint32(pos, value, true)
    pos += 4
  }
  const raw = (bytes: Uint8Array) => {
    out.set(bytes, pos)
    pos += bytes.length
  }

  for (const p of prepared) {
    u32(LOCAL_SIG)
    u16(20) // version needed
    u16(0x0800) // flags: bit 11, names are UTF-8
    u16(0) // method: store
    u16(DOS_TIME)
    u16(DOS_DATE)
    u32(p.crc)
    u32(p.data.length) // compressed size == uncompressed, stored
    u32(p.data.length)
    u16(p.nameBytes.length)
    u16(0) // extra field length
    raw(p.nameBytes)
    raw(p.data)
  }

  for (const p of prepared) {
    u32(CENTRAL_SIG)
    u16(20) // version made by
    u16(20) // version needed
    u16(0x0800)
    u16(0)
    u16(DOS_TIME)
    u16(DOS_DATE)
    u32(p.crc)
    u32(p.data.length)
    u32(p.data.length)
    u16(p.nameBytes.length)
    u16(0) // extra
    u16(0) // comment
    u16(0) // disk number start
    u16(0) // internal attributes
    u32(0o100644 << 16) // external attributes: regular file, rw-r--r--
    u32(p.offset)
    raw(p.nameBytes)
  }

  u32(EOCD_SIG)
  u16(0) // this disk
  u16(0) // disk with central directory
  u16(prepared.length)
  u16(prepared.length)
  u32(centralSize)
  u32(centralStart)
  u16(0) // comment length

  return out
}
