# -*- coding: utf-8 -*-
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import argparse
import hashlib
import json
import re
import shutil
from release_sources import SOURCE_SCOPE, project_roots, source_hashes
root=Path(__file__).resolve().parents[1]
app, admin, backend = project_roots(root)
workspace = root.parent
parser=argparse.ArgumentParser(description='Package builds, optionally from a verified immutable QA release.')
parser.add_argument('--release', help='Frozen release ID, e.g. qa-20261118-r16')
parser.add_argument('--output', help='Output directory; defaults to deliverables/')
args=parser.parse_args()
artifact_root=None
backend_name='maoyi-backend.jar'
if args.release:
 if not re.fullmatch(r'qa-[A-Za-z0-9-]+',args.release): parser.error('Invalid release ID')
 artifact_root=root/'.data/qa/releases'/args.release
 manifest=json.loads((artifact_root/'manifest.json').read_text())
 if manifest.get('id')!=args.release: raise ValueError('Release manifest ID mismatch')
 actual={str(p.relative_to(artifact_root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in artifact_root.rglob('*') if p.is_file() and p!=artifact_root/'manifest.json'}
 if actual!=manifest['files']: raise ValueError('Frozen release contents differ from manifest; refusing to package')
 backend_names=[name for name in ('maoyi-backend.jar','ruoyi-admin.jar') if name in actual]
 if len(backend_names)!=1: raise ValueError('Release must contain exactly one supported backend artifact')
 backend_name=backend_names[0]
 if manifest.get('backendArtifact',backend_name)!=backend_name:
  raise ValueError('Backend artifact declaration does not match release contents')
 for required in ['h5/index.html','mp-weixin/app.js','admin/index.html',backend_name]:
  if required not in actual: raise ValueError('Missing required release artifact: '+required)
 if manifest.get('sourceScope')!=SOURCE_SCOPE or not manifest.get('sourceFiles'):
  raise ValueError('Release has no complete runtime/build source fingerprint; freeze a new release before packaging')
 if source_hashes(root)!=manifest['sourceFiles']:
  raise ValueError('Runtime/build sources differ from frozen release; refusing to package')
backend_source=artifact_root/backend_name if artifact_root else backend/'ruoyi-admin/target/maoyi-backend.jar'
if not backend_source.is_file(): raise ValueError('Missing built backend artifact: '+str(backend_source))
out=Path(args.output).resolve() if args.output else root/'deliverables';out.mkdir(parents=True,exist_ok=True)
excluded={'node_modules','.git','target','dist','.data','.secrets','logs','__pycache__'}
app_dirs = ['src', 'deploy', 'scripts', 'tests', 'docs', 'server', 'cloud']
files = []
for directory in [*(root / name for name in app_dirs), admin, backend]:
 for p in directory.rglob('*'):
  if p.is_symlink():
   if not any(part in excluded for part in p.relative_to(workspace).parts):
    raise ValueError('Source archive cannot contain symbolic links: ' + str(p))
  elif p.is_file() and not any(part in excluded for part in p.relative_to(workspace).parts) and not p.name.endswith('.log') and p.name != '.DS_Store':
   files.append(p)
files += [root / f for f in ['package.json', 'package-lock.json', 'README.md', 'PRODUCT.md', 'DESIGN.md', 'index.html', 'vite.config.js', 'shims-uni.d.ts', '.env.example', '.gitignore', '.dockerignore', 'drizzle.config.mjs']]
files += [workspace / '.dockerignore']
if (workspace / '项目位置.txt').is_file(): files.append(workspace / '项目位置.txt')
with ZipFile(out / 'maoyi-source.zip', 'w', ZIP_DEFLATED) as z:
 for p in sorted(set(files)): z.write(p, str(p.relative_to(workspace)))
for base, frozen, name in [(root / 'dist/build/mp-weixin', 'mp-weixin', 'maoyi-app-微信小程序.zip'), (root / 'dist/build/h5', 'h5', 'maoyi-app-H5.zip'), (admin / 'dist', 'admin', 'maoyi-admin.zip')]:
 base = artifact_root / frozen if artifact_root else base
 with ZipFile(out / name, 'w', ZIP_DEFLATED) as z:
  for p in base.rglob('*'):
   if p.is_file(): z.write(p, p.relative_to(base))
shutil.copy2(backend_source,out/'maoyi-backend.jar')
if artifact_root:
 shutil.copy2(artifact_root/'manifest.json',out/'运行版本-manifest.json')
with ZipFile(out/'maoyi-source.zip') as z:
 names=z.namelist()
 assert not any('/.secrets/' in n or '/.data/' in n or '/.git/' in n or '/node_modules/' in n or '/target/' in n for n in names)
 assert 'maoyi-admin/LICENSE' in names and 'maoyi-backend/LICENSE' in names
for p in sorted(out.iterdir()):
 if p.is_file():print(f'{p.name}: {p.stat().st_size/1024/1024:.1f} MB')
