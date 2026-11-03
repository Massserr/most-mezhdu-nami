"""Mix the actual browser recording with seven original Russian voice segments.

Run from repository root: python documentation/mix_demo.py ../outputs/competition
Input files live in ../work/voice and ../work/demo-recording.
"""
from pathlib import Path
import json
import re
import subprocess
import sys

root=Path(__file__).resolve().parents[1]
work=root.parent/'work'
output=Path(sys.argv[1]).resolve()
raw=work/'demo-recording/gameplay.webm'
segments=json.loads((work/'demo-recording/recorded-segments.json').read_text())
recording_duration=sum(s['duration'] for s in segments)
targets=[s['voiceDuration']+.7 for s in segments]
duration=sum(targets)
if duration>=179:
    raise SystemExit(f'Recording too long ({duration:.2f}s); shorten scene holds before mixing.')
raw_duration=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',str(raw)]))
metadata=json.loads((work/'demo-recording/video-metadata.json').read_text())
# Final screenshots and recorder flush are tail time, not an initial blank frame.
lead=max(0,min(metadata['leadInSeconds'],raw_duration-recording_duration-.15))
command=['ffmpeg','-hide_banner','-loglevel','warning','-y','-ss',str(lead),'-i',str(raw)]
for i in range(1,8):command+=['-i',str(work/f'voice/{i:02}.aiff')]
# Playwright's JPEG screencast carries full-range luma into VP8. Convert it to
# standard video range explicitly so the cream and green palette is preserved.
filters=['[0:v]scale=in_range=pc:out_range=tv,split=7'+''.join(f'[source{i}]' for i in range(1,8))]
cursor=0
for i,s in enumerate(segments,1):
    target_duration=targets[i-1]
    filters.append(f'[source{i}]trim=start={cursor:.6f}:end={cursor+s["duration"]:.6f},setpts={target_duration/s["duration"]:.8f}*(PTS-STARTPTS),fps=25[v{i}]')
    filters.append(f'[{i}:a]apad,atrim=duration={target_duration:.6f},asetpts=PTS-STARTPTS[a{i}]')
    cursor+=s['duration']
filters.append(''.join(f'[v{i}]' for i in range(1,8))+'concat=n=7:v=1:a=0,tpad=stop_mode=clone:stop_duration=1[video]')
filters.append(''.join(f'[a{i}]' for i in range(1,8))+'concat=n=7:v=0:a=1,alimiter=limit=0.95[audio]')
target=output/'04-Демонстрация.mp4'
command+=['-filter_complex',';'.join(filters),'-map','[video]','-map','[audio]',
    '-t',f'{duration:.6f}','-c:v','libx264','-threads','2','-preset','veryfast','-crf','22',
    '-pix_fmt','yuv420p','-color_range','tv','-r','25','-c:a','aac','-b:a','128k','-movflags','+faststart',str(target)]
subprocess.run(command,check=True)
probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_format','-show_streams','-of','json',str(target)]))
assert float(probe['format']['duration'])<=180
assert {'video','audio'} <= {s['codec_type'] for s in probe['streams']}
levels=subprocess.run(['ffmpeg','-hide_banner','-i',str(target),'-vn','-af','volumedetect','-f','null','-'],capture_output=True,text=True,check=True)
mean=re.search(r'mean_volume: ([\-\d.]+) dB',levels.stderr)
assert mean and float(mean[1])>-45,'Narration must not be silent'
result={'file':target.name,'seconds':float(probe['format']['duration']),
    'bytes':target.stat().st_size,'voice':'Milena, original Russian narration synthesized locally',
    'meanVolumeDb':float(mean[1]),'streams':[{k:s.get(k) for k in ['codec_type','codec_name','width','height','sample_rate','channels']} for s in probe['streams']],
    'actualRecordingSeconds':recording_duration,'sceneOutputSeconds':targets,
    'editing':'Real gameplay scenes are retimed to the narration; no game state injection.',
    'scenes':segments}
(output/'video-verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(result,ensure_ascii=False,indent=2))
