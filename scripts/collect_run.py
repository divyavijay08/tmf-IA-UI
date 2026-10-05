"""Invoke the deployed collection and evaluation tools without shell interpolation."""
import os,subprocess,sys
run_id=sys.argv[1]
for args in (['pull',run_id,'--json'],['test','7',run_id,'--json'],['test','16',run_id,'--json']):
 result=subprocess.run(['python3','tools/alphactl.py',*args],env=os.environ.copy(),timeout=240)
 if result.returncode and args[0]=='pull':raise SystemExit(result.returncode)
