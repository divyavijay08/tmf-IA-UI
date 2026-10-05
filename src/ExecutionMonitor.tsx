import {formatUTCDate,formatUTCTime,formatUTCDateTime} from './dateTime';
import {Button} from '@mui/material';
import PlayArrowOutlined from '@mui/icons-material/PlayArrowOutlined';
import PauseOutlined from '@mui/icons-material/PauseOutlined';
import OpenInNewOutlined from '@mui/icons-material/OpenInNewOutlined';
import InfoOutlined from '@mui/icons-material/InfoOutlined';

type Props={
 connection:string;polling:boolean;lastCheck:string|null;readAt?:string;
 runs:number;records:number;onToggle:()=>void;runnerUrl:string;
};

function Timestamp({value}:{value?:string|null}){
 if(!value)return <strong className="monitor-waiting">Awaiting evidence</strong>;
 return <time className="monitor-timestamp" dateTime={value} title={`${formatUTCDateTime(value)} UTC`}>
  <strong>{formatUTCDate(value)}</strong>
  <span>{formatUTCTime(value)} UTC</span>
 </time>;
}

export function ExecutionMonitor({connection,polling,lastCheck,readAt,runs,records,onToggle,runnerUrl}:Props){
 const connected=connection.startsWith('Connected');
 return <section className="wa-panel wa-monitor" aria-label="Execution evidence monitor">
  <header>
   <div className="monitor-title"><h2>Execution evidence monitor</h2><p>Connection health and evidence freshness</p></div>
   <div className="monitor-controls">
    <span>{polling?'Checks every 15 seconds':'Manual refresh'}</span>
    <Button variant={polling?'contained':'outlined'} startIcon={polling?<PauseOutlined/>:<PlayArrowOutlined/>}
     aria-pressed={polling} onClick={onToggle}>{polling?'Pause monitoring':'Start monitoring'}</Button>
   </div>
  </header>
  <div className="monitor-body">
   <div className="monitor-connection" role="status">
    <span className={`monitor-status ${connected?'is-connected':''}`}>{connected?'Connected':'Awaiting connection'}</span>
    <span>{connection}</span>
   </div>
   <dl className="monitor-metrics">
    <div><dt>Last connection check</dt><dd><Timestamp value={lastCheck}/></dd></div>
    <div><dt>Evidence read at</dt><dd><Timestamp value={readAt}/></dd></div>
    <div><dt>Recorded runs</dt><dd className="monitor-count">{runs.toLocaleString()}<span>in the current evidence</span></dd></div>
    <div><dt>Source records</dt><dd className="monitor-count">{records.toLocaleString()}<span>across recorded runs</span></dd></div>
   </dl>
   <div className="monitor-note"><InfoOutlined/><p>Monitoring checks collected evidence every 15 seconds while this tab is visible. Saved snapshots are not live execution data.</p></div>
  </div>
  <footer className="monitor-footer"><div><strong>Need to start an execution?</strong><span>Use the deployed runner to launch agents.</span></div>
   <Button variant="outlined" endIcon={<OpenInNewOutlined/>} component="a" href={runnerUrl} target="_blank" rel="noopener noreferrer">Open deployed runner</Button>
  </footer>
 </section>;
}
