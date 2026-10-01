'use strict';
/* The taskbar showed a generic blank-page icon instead of the app logo.
 *
 * It was not the artwork, not the ico, and not the window. Windows caches a
 * taskbar icon per AppUserModelId and never re-reads it, so every shop that
 * had ever run an older build kept "no icon" cached against that id forever.
 * Rebuilding with a never-seen id made the logo appear with no other change.
 *
 * These checks stop the three ways this comes back:
 *   1. the AppUserModelId must not be the old cached one
 *   2. the ico must ship unpacked, because the shell is not Electron and
 *      cannot read inside app.asar
 *   3. the app must be able to write its own shortcut, since a portable copy or
 *      a double-click gives the shell no shortcut to take an icon from
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const main = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (c, l, e) => { if (c) { pass++; console.log('  PASS ' + l); } else { fail++; console.log('  FAIL ' + l + (e !== undefined ? ' -> ' + e : '')); } };

console.log('--- the taskbar identity ---');
const CACHED_ID = 'com.alvand.gamenet.manager';
ok(!main.includes("setAppUserModelId('" + CACHED_ID + "')"),
   'main.js does not reuse the id whose icon is cached as blank',
   CACHED_ID);
ok(!String(pkg.build.appId).includes(CACHED_ID),
   'package.json appId is not the poisoned one either', pkg.build.appId);

const aumid = (main.match(/setAppUserModelId\('([^']+)'\)/) || [])[1];
ok(!!aumid, 'an AppUserModelId is set at all');
ok(aumid === pkg.build.appId,
   'it matches appId, or the shell groups the app under two identities',
   aumid + ' vs ' + pkg.build.appId);
// the id must be set before the app is ready, or Windows ignores it
const aumidPos = main.indexOf('setAppUserModelId');
const readyPos = main.indexOf('app.whenReady()');
ok(aumidPos > 0 && aumidPos < readyPos,
   'it is set before the app is ready',
   'aumid at ' + aumidPos + ', whenReady at ' + readyPos);
ok(!/setAppUserModelId\([^)]*\)\s*;?\s*}\s*catch\s*\{\s*\/\*\s*ignore/i.test(main.slice(aumidPos - 200, aumidPos + 120)) === false
   || /catch/.test(main.slice(aumidPos, aumidPos + 120)),
   'a failure to set it cannot crash startup');

console.log('--- the icon the shell can actually read ---');
const er = pkg.build.extraResources || [];
const iconRes = er.find((r) => r.to === 'icon.ico');
ok(!!iconRes, 'the ico ships as an extraResource (unpacked, on the real filesystem)');
ok(!!iconRes && iconRes.from === 'assets/icon.ico', 'and it is the app icon', iconRes && iconRes.from);
ok(fs.existsSync(path.join(ROOT, (iconRes && iconRes.from) || 'assets/icon.ico')),
   'the source file it copies exists');

const buildWinIcon = ((pkg.build.win || {}).icon);
ok(buildWinIcon === 'assets/icon.ico',
   'the exe itself still gets the icon embedded', buildWinIcon);

console.log('--- resolveIcon prefers a path the shell can open ---');
const fn = main.slice(main.indexOf('function resolveIcon'), main.indexOf('function resolveIcon') + 900);
ok(/process\.resourcesPath/.test(fn), 'it looks next to the resources folder first');
ok(/process\.execPath/.test(fn), 'then next to the running exe');
// the in-asar fallback is written as path.join(__dirname, 'assets', 'icon.ico')
ok(/assets['"]?\s*,\s*['"]icon\.ico/.test(fn) || /assets[\\/]+icon\.ico/.test(fn),
   'and falls back to the copy in the asar', fn.replace(/\s+/g, ' ').slice(0, 120));
// order matters: the unpacked copies must come before the asar one
const iRes = fn.indexOf('process.resourcesPath');
const iExe = fn.indexOf('process.execPath');
const asarMatch = fn.match(/assets['"]?\s*,\s*['"]icon\.ico/) || fn.match(/assets[\\/]+icon\.ico/);
const iAsar = asarMatch ? asarMatch.index : -1;
ok(iRes >= 0 && iExe > iRes && iAsar > iExe,
   'the unpacked paths are tried before the one inside app.asar',
   'resources=' + iRes + ' exe=' + iExe + ' asar=' + iAsar);

console.log('--- the app writes its own shortcut ---');
ok(/function ensureStartMenuShortcut/.test(main), 'there is a function for it');
const ef = main.slice(main.indexOf('function ensureStartMenuShortcut'),
                      main.indexOf('function ensureStartMenuShortcut') + 2200);
ok(/Start Menu/.test(ef) && /\.lnk/.test(ef), 'it targets the Start Menu with a .lnk');
ok(/WScript\.Shell/.test(ef), 'it uses WScript.Shell, the only way to write a .lnk');
ok(/IconLocation/.test(ef), 'it sets IconLocation, which is what the shell reads');
ok(/process\.execPath/.test(ef), 'it points at the real running exe');
ok(/PORTABLE_EXECUTABLE_DIR/.test(ef), 'it does not litter a Start Menu entry for the portable build');
ok(/catch/.test(ef), 'a failure is swallowed, so startup never depends on it');
ok(/spawnSync|execFile|exec\(/.test(ef), 'it shells out, since Node cannot write .lnk');

// it has to actually run
const callPos = main.indexOf('ensureStartMenuShortcut(icon)');
ok(callPos > 0, 'it is called');
const showPos = main.indexOf("mainWindow.once('ready-to-show'");
ok(callPos > showPos, 'from the ready-to-show handler, once the exe path is settled');

console.log('--- the ico itself is usable by the shell ---');
const icoPath = path.join(ROOT, 'assets', 'icon.ico');
const b = fs.readFileSync(icoPath);
ok(b.length > 6, 'it exists', b.length + ' bytes');
const reserved = b.readUInt16LE(0), type = b.readUInt16LE(2), count = b.readUInt16LE(4);
ok(reserved === 0 && type === 1, 'it is a real ico', 'reserved=' + reserved + ' type=' + type);
const sizes = [];
for (let i = 0; i < count; i++) {
  const o = 6 + i * 16;
  sizes.push(b[o] === 0 ? 256 : b[o]);
}
ok(sizes.includes(256), 'it has a 256x256 for high-DPI taskbars', sizes.join(','));
ok(sizes.includes(48), 'it has 48x48, the usual taskbar size', sizes.join(','));
ok(sizes.includes(32) && sizes.includes(16), 'and 32/16 for smaller slots', sizes.join(','));

console.log(fail === 0 ? '\nTASKBAR ICON CHECKS PASSED (' + pass + ')' : '\n' + fail + ' FAILED (' + pass + ' passed)');
process.exit(fail ? 1 : 0);