import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

if (process.platform !== 'darwin') throw Error('Run package verification on macOS.')
const { version } = JSON.parse(readFileSync('package.json', 'utf8'))
const arch = process.arch
const app = resolve(`dist/${arch === 'arm64' ? 'mac-arm64' : 'mac'}/MyLike.app`)
const dmg = resolve(`dist/MyLike-${version}-mac-${arch}.dmg`)
const run = (file, args) => execFileSync(file, args, { encoding: 'utf8' }).trim()
function verify(bundle) {
  const plist = join(bundle, 'Contents/Info.plist')
  if (!existsSync(plist) || existsSync(join(bundle, 'MyLike.app')))
    throw Error(`Invalid application bundle layout: ${bundle}`)
  const actual = run('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleShortVersionString', plist])
  if (actual !== version) throw Error(`Package version mismatch: ${actual} != ${version}`)
  const architectures = run('/usr/bin/lipo', ['-archs', join(bundle, 'Contents/MacOS/MyLike')]).split(/\s+/)
  if (!architectures.includes(arch)) throw Error(`Missing ${arch} executable: ${bundle}`)
  run('/usr/bin/codesign', ['--verify', '--deep', '--strict', bundle])
}
verify(app)
const temporary = mkdtempSync(join(tmpdir(), 'mylike-package-check-'))
const mount = join(temporary, 'volume')
let mounted = false
try {
  run('/usr/bin/hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mount, dmg])
  mounted = true
  verify(join(mount, 'MyLike.app'))
  console.log(
    `Verified ${version} (${arch}): application, DMG layout and signature integrity. Apple notarization is a separate check.`
  )
} finally {
  // Never recursively remove a mounted volume if detaching fails.
  if (mounted) {
    run('/usr/bin/hdiutil', ['detach', mount])
    mounted = false
  }
  rmSync(temporary, { recursive: true, force: true })
}
