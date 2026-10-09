"""Create a NEW source handoff zip from an explicit allowlist. Never reads real env files."""
from pathlib import Path
import datetime
import hashlib
import json
import stat
import zipfile

root = Path(__file__).resolve().parent.parent
out = root / 'deploy/out'
out.mkdir(exist_ok=True)
batch = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
target = out / f'ai-town-ubuntu-{batch}.zip'
files = []
for folder in ['web/src', 'web/public', 'web/tests', 'web/scripts', 'deploy/ops', 'deploy/ci']:
    files.extend(p for p in (root/folder).rglob('*') if p.is_file())
for file in ['web/package.json', 'web/package-lock.json', 'web/tsconfig.json', 'web/next.config.ts',
             'web/next-env.d.ts', 'web/eslint.config.mjs', 'deploy/README-UBUNTU.md', 'deploy/VALIDATION.md',
             'deploy/render-caddy.py', 'deploy/validate-local.sh', 'deploy/pack-handoff.py', 'LICENSE']:
    files.append(root/file)
manifest = []
def add_file(archive, name, content):
    info=zipfile.ZipInfo(name)
    info.create_system=3
    info.external_attr=(stat.S_IFREG | 0o644) << 16
    info.compress_type=zipfile.ZIP_DEFLATED
    archive.writestr(info,content)
with zipfile.ZipFile(target, 'x', compression=zipfile.ZIP_DEFLATED) as archive:
    for file in sorted(set(files)):
        relative = file.relative_to(root).as_posix()
        if file.is_symlink() or any(part in {'node_modules','.next','.git','__pycache__','evidence'} for part in file.parts):
            raise SystemExit(f'Excluded path encountered: {relative}')
        if file.name.startswith('.env') or file.name == 'runtime.env' or file.suffix in {'.dump','.zip','.gz','.pyc'}:
            raise SystemExit(f'Excluded file encountered: {relative}')
        content = file.read_bytes()
        if file.suffix in {'.sh','.service','.sql','.example','.yml'}:
            assert b'\r' not in content, f'Use LF: {relative}'
        add_file(archive, relative, content)
        manifest.append(f'{hashlib.sha256(content).hexdigest()}  {relative}')
    add_file(archive, 'SHA256SUMS', '\n'.join(manifest)+'\n')
checksum=hashlib.sha256(target.read_bytes()).hexdigest()
target.with_name(target.name+'.sha256').write_text(f'{checksum}  {target.name}\n', encoding='ascii')
out.joinpath(f'{batch}-manifest.json').write_text(json.dumps({'zip':str(target),'files':len(manifest),'sha256':checksum,'realEnvIncluded':False},indent=2), encoding='utf-8')
print(json.dumps({'zip':str(target),'files':len(manifest),'sha256':checksum},ensure_ascii=False))
