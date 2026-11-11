#!/usr/bin/env python3
"""Exporta somente arquivos públicos, sem o histórico Git ou dados locais."""
from pathlib import Path
import shutil
import subprocess
import zipfile

root = Path(__file__).resolve().parent.parent
output = root / 'artifacts' / 'clima-store-portfolio'
if output.exists():
    raise SystemExit(f'A exportação já existe: {output}. Mova-a antes de exportar novamente.')
files = subprocess.check_output(
    ['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd=root
).decode().split('\0')
allowed_dirs = {'src', 'shared', 'server', 'prisma', 'public', 'docs', 'scripts', 'deploy', 'netlify', 'icones'}
allowed_root = {'.gitignore', '.gitattributes', '.env.example', '.env.accounts.example',
                '.env.payments.example', '.env.shipping.example', 'README.md', 'index.html',
                'package.json', 'package-lock.json', 'vite.config.ts', 'eslint.config.js',
                'tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json', 'prisma7.config.ts', 'netlify.toml'}
selected = []
for name in sorted(set(files)):
    if not name:
        continue
    path = Path(name)
    source = root / path
    if not source.is_file() or source.is_symlink():
        continue
    if (len(path.parts) == 1 and name not in allowed_root) or (len(path.parts) > 1 and path.parts[0] not in allowed_dirs):
        continue
    if any(part in {'.git', 'node_modules', 'uploads', 'generated', '.DS_Store'} for part in path.parts):
        continue
    if source.suffix in {'.pem', '.key', '.dump', '.backup', '.zip'} or (path.name.startswith('.env') and not path.name.endswith('.example')):
        continue
    selected.append(path)
# Confere os valores sensíveis locais sem imprimi-los ou copiá-los.
secrets = []
env = root / '.env'
if env.exists():
    for line in env.read_text().splitlines():
        key, sep, value = line.partition('=')
        value = value.strip().strip('"\'')
        if sep and any(word in key.upper() for word in ['SECRET', 'TOKEN', 'PASS', 'DATABASE_URL']) and len(value) >= 12:
            secrets.append(value.encode())
for path in selected:
    content = (root / path).read_bytes()
    if any(secret in content for secret in secrets):
        raise SystemExit(f'Exportação interrompida: possível credencial local em {path}')
output.mkdir(parents=True)
for path in selected:
    destination = output / path
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(root / path, destination)
archive = output.with_suffix('.zip')
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as zipped:
    for path in selected:
        zipped.write(output / path, f'clima-store-portfolio/{path.as_posix()}')
print(f'Exportação: {output}\nZIP: {archive}\n{len(selected)} arquivos públicos; sem histórico Git.')
