from pathlib import Path
import json

root=Path('.')

rp=root/'web'/'human-detect'/'reperformance-panel.js'
txt=rp.read_text(encoding='utf-8')
old="""    Clean:{timing:8,velocity:6,bass:35,drums:30},
    Warm:{timing:14,velocity:10,bass:50,drums:38},
    Punchy:{timing:10,velocity:12,bass:45,drums:60},
    Electronic:{timing:6,velocity:5,bass:62,drums:68}
  })[name]||{timing:10,velocity:8,bass:45,drums:45};"""
new="""    Clean:{timing:12,velocity:10,bass:45,drums:42},
    Warm:{timing:18,velocity:15,bass:60,drums:50},
    Punchy:{timing:16,velocity:20,bass:60,drums:72},
    Electronic:{timing:11,velocity:12,bass:72,drums:76}
  })[name]||{timing:14,velocity:14,bass:58,drums:58};"""
if old not in txt:
    raise SystemExit('v3.2.3 profile settings anchor not found')
txt=txt.replace(old,new)
txt=txt.replace("v2.7 • Auto Instrument Selection + Basic Pitch + virtual instruments",
                "v2.8 • Adaptive Re-Performance + Basic Pitch + virtual instruments")
txt=txt.replace('type="range" min="0" max="35" value="12"', 'type="range" min="0" max="45" value="12"')
txt=txt.replace('type="range" min="0" max="25" value="8"', 'type="range" min="0" max="35" value="8"')
rp.write_text(txt,encoding='utf-8')

# Keep UI wording synchronized with the expanded optimizer.
for p in (root/'web'/'human-detect').glob('*.js'):
    t=p.read_text(encoding='utf-8')
    if 'TRY 6 VARIANTS' in t:
        p.write_text(t.replace('TRY 6 VARIANTS','TRY 12 VARIANTS'),encoding='utf-8')

pkg=root/'package.json'
j=json.loads(pkg.read_text(encoding='utf-8'))
j['version']='3.2.3'
pkg.write_text(json.dumps(j,indent=2)+'\n',encoding='utf-8')
print('HumanDetect v3.2.3 adaptive humanization patch applied')
