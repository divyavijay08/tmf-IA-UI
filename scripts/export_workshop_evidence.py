from pathlib import Path
import json,base64,zlib,datetime
base=Path('/home/ec2-user/environment/evidence/runs')
ids=['guarded-aadb07cd4ce545f1a532aa92e43e011b','guarded-bbd1fb20c7074ccb87399c7305ebe461','guarded-c5300357ce404413a49787e1ccbec694']
out={'schema':1,'source':'AWS Workshop evidence export','capturedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'runs':[]}
for rid in ids:
 p=base/rid
 def read(name):
  f=p/name
  return json.loads(f.read_text()) if f.exists() else {}
 report=read('control-16.json'); budget=read('budget.json'); manifest=read('manifest.json')
 keys=['run.id','verdict','threshold.version','threshold.value','owner','alert.point','measured.value','measurement.complete','evidence.refs','quarantined.refs','findings','warnings','window','measured.detail']
 events=[{k:e.get(k) for k in ('event_id','phase','actor','emitted_at','call_id','verdict','reason','committed','reserved','estimate','projected','recipient','delivery_status')} for e in budget.get('events',[])]
 out['runs'].append({'id':rid,'scenario':manifest.get('scenario'),'completed':manifest.get('completed'),'report':{k:report.get(k) for k in keys},'budget':{k:budget.get(k) for k in ('committed','reserved','blocked','threshold')},'events':events,'sourcePath':str(p)})
import sys
Path(sys.argv[1] if len(sys.argv)>1 else 'workshop-evidence.json').write_text(json.dumps(out,indent=2))
