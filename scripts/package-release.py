"""Package the tested offline build, technical documents and voiced video.

Run from the repository root after npm run build:
python scripts/package-release.py /absolute/output/directory
The output directory must contain 04-Демонстрация.mp4.
"""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import zipfile

root=Path(__file__).resolve().parents[1]
output=Path(sys.argv[1]).resolve()
video=output/'04-Демонстрация.mp4'
if not video.is_file():
    raise SystemExit('Narrated demonstration video is required before packaging.')
required=['01-Установка.pdf','02-Инструкция-игрока.pdf','03-Обоснование-тематики.pdf']
for name in required:
    if not (output/name).is_file():
        raise SystemExit(f'Missing {name}')
probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(video)]))
assert float(probe['format']['duration'])<=180
assert {'audio','video'} <= {s['codec_type'] for s in probe['streams']}
archive=output/'Мост-между-нами-конкурс.zip'
files={}
for p in (root/'dist').rglob('*'):
    if p.is_file():files['game/'+p.relative_to(root).as_posix()]=p
for name in ['scripts/server.cjs','Запустить игру.cmd','Запустить игру.command','start-game.sh']:
    files['game/'+name]=root/name
for p in (root/'licenses').glob('*'):
    if p.is_file():files['game/licenses/'+p.name]=p
for name in required:files[name]=output/name
files[video.name]=video
files['ДОБАВИТЬ-ПЕРЕД-ПОДАЧЕЙ.txt']=root/'documentation/ДОБАВИТЬ-ПЕРЕД-ПОДАЧЕЙ.txt'
files['Сценарий-демонстрации.md']=root/'documentation/demo-script.md'
for p in (root/'documentation/narration').glob('*.txt'):
    files['narration/'+p.name]=p
tracked=subprocess.check_output(['git','ls-files','-z'],cwd=root).decode().split('\0')
for name in tracked:
    if name and (root/name).is_file():files['source/'+name]=root/name
manifest={
    'version':'2.0.0',
    'commit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),
    'branch':subprocess.check_output(['git','branch','--show-current'],cwd=root,text=True).strip(),
    'videoSeconds':float(probe['format']['duration']),
    'manualDocumentsRequired':True,
    'files':{name:{'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for name,p in files.items()},
}
with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for name,p in sorted(files.items()):z.write(p,name)
    z.writestr('CONTEST-MANIFEST.json',json.dumps(manifest,ensure_ascii=False,indent=2))
    z.writestr('ПРОЧИТАЙТЕ-СНАЧАЛА.txt',
        'Мост между нами. Конкурсная редакция 2.0.\n\n'
        'Откройте 01-Установка.pdf. Рабочая игра находится в game.\n'
        'Требуется бесплатный Node.js 22.13 или новее. После установки игра работает без интернета.\n'
        'Видео содержит закадровую речь; техническая озвучка - системный русский голос Milena.\n'
        'Исходники находятся в source, сценарий и реплики демонстрации приложены.\n\n'
        'Перед подачей ОБЯЗАТЕЛЬНО добавьте официальное заявление команды и индивидуальные согласия участников. '
        'Они не заполнены автоматически. Прочитайте ДОБАВИТЬ-ПЕРЕД-ПОДАЧЕЙ.txt.\n')
assert archive.stat().st_size<=200_000_000
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    assert all(not f.flag_bits&1 for f in z.infolist())
    assert 'game/dist/index.html' in z.namelist()
    assert not any('/node_modules/' in n or '/.git/' in n or n.endswith('/.env') for n in z.namelist())
verification={'archive':archive.name,'bytes':archive.stat().st_size,'entries':len(files)+2,
    'videoSeconds':manifest['videoSeconds'],'password':False,'crc':'passed','manualDocumentsRequired':True,
    'sha256':hashlib.sha256(archive.read_bytes()).hexdigest()}
(output/'release-verification.json').write_text(json.dumps(verification,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(verification,ensure_ascii=False,indent=2))
