// Builds the zip you send to friends: only the files the extension needs to run, nothing else.
//   npm run pack  ->  dist/blackout-vi-v<version>.zip  (unzips to a folder you load with "Load unpacked")
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const NAME = 'blackout-vi';
const INCLUDE = ['manifest.json', 'README.md', 'src', 'assets'];
// source art kept on disk only (also git-ignored): the extension never loads it
const SKIP = new Set(['gta-vi-logo.eps', 'background-full.png']);

const copy = (from, to) => {
  if (fs.statSync(from).isDirectory()) {
    fs.mkdirSync(to, { recursive: true });

    for (const name of fs.readdirSync(from)) {
      if (!SKIP.has(name)) {
        copy(path.join(from, name), path.join(to, name));
      }
    }

    return;
  }

  fs.copyFileSync(from, to);
};

const walk = dir => {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);

    return entry.isDirectory() ? walk(full) : [full];
  });
};

// every file the manifest points at
const referenced = manifest => {
  const files = [
    ...Object.values(manifest.icons || {}),
    ...Object.values(manifest.action?.default_icon || {}),
    manifest.action?.default_popup,
    manifest.background?.service_worker,
  ];

  for (const group of manifest.content_scripts || []) {
    files.push(...group.js, ...group.css);
  }

  for (const group of manifest.web_accessible_resources || []) {
    files.push(...group.resources);
  }

  return files.filter(Boolean);
};

// Copies the runtime files into `target` and checks the copy is complete. Returns what it found.
const stage = target => {
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });

  for (const item of INCLUDE) {
    copy(path.join(ROOT, item), path.join(target, item));
  }

  const manifest = JSON.parse(fs.readFileSync(path.join(target, 'manifest.json'), 'utf8'));
  const missing = referenced(manifest).filter(file => {
    return !fs.existsSync(path.join(target, file));
  });
  const files = walk(target);
  const bytes = files.reduce((sum, file) => {
    return sum + fs.statSync(file).size;
  }, 0);

  return { manifest, missing, files, bytes };
};

const zip = (folder, archive) => {
  fs.rmSync(archive, { force: true });

  // Windows ships bsdtar, which writes proper zip paths. (PowerShell's Compress-Archive writes backslashes, which come
  // out as broken file names when the zip is opened on a Mac.)
  if (process.platform === 'win32') {
    // the full path: a Git-for-Windows shell puts GNU tar first on the PATH, and GNU tar cannot write zips
    const tar = path.join(process.env.SystemRoot || 'C:/Windows', 'System32', 'tar.exe');

    execFileSync(tar, ['-a', '-c', '-f', archive, '-C', path.dirname(folder), path.basename(folder)]);

    return;
  }

  execFileSync('zip', ['-r', '-q', archive, path.basename(folder)], { cwd: path.dirname(folder) });
};

const main = () => {
  const dist = path.join(ROOT, 'dist');
  const folder = path.join(dist, NAME);

  fs.rmSync(dist, { recursive: true, force: true });
  fs.mkdirSync(dist, { recursive: true });

  const { manifest, missing, files, bytes } = stage(folder);

  if (missing.length) {
    console.error('The manifest points at files that are not in the package:\n  ' + missing.join('\n  '));
    process.exit(1);
  }

  const archive = path.join(dist, `${NAME}-v${manifest.version}.zip`);

  zip(folder, archive);
  console.log(`${files.length} files, ${(bytes / 1024).toFixed(0)} KB of files`);
  console.log(`zip: ${archive} (${(fs.statSync(archive).size / 1024).toFixed(0)} KB)`);
  console.log(`folder to load unpacked: ${folder}`);
};

if (require.main === module) {
  main();
}

module.exports = { stage, referenced };
