import {formatUTCDateTime} from './dateTime';
import {Button,IconButton,Tooltip} from '@mui/material';
import MenuOutlined from '@mui/icons-material/MenuOutlined';
import RefreshOutlined from '@mui/icons-material/RefreshOutlined';
import FileDownloadOutlined from '@mui/icons-material/FileDownloadOutlined';
import AccessTimeOutlined from '@mui/icons-material/AccessTimeOutlined';
import InfoOutlined from '@mui/icons-material/InfoOutlined';

type Props={
 section:string; title:string; description:string; source:string; readAt?:string;
 busy:boolean; canExport:boolean; workspaceScope:boolean;
 onRefresh:()=>void; onExport:()=>void; onOpenNavigation:()=>void;
};

export default function PageHeader({section,title,description,source,readAt,busy,canExport,workspaceScope,onRefresh,onExport,onOpenNavigation}:Props){
 return <header className="workspace-header">
  <div className="workspace-heading-row">
   <IconButton className="wa-mobile-menu" aria-label="Open navigation" onClick={onOpenNavigation}><MenuOutlined/></IconButton>
   <div className="workspace-heading">
    <div className="workspace-title-line">
     <h1>{title}</h1>
     <span className="workspace-eyebrow">{section}</span>
    </div>
    <p>{description}</p>
   </div>
   <div className="workspace-actions">
    <Button variant="outlined" startIcon={<RefreshOutlined/>} disabled={busy} onClick={onRefresh}>{busy?'Refreshing…':'Refresh'}</Button>
    <Button variant="contained" startIcon={<FileDownloadOutlined/>} disabled={!canExport} onClick={onExport}>{workspaceScope?'Export workspace':'Export run'}</Button>
   </div>
  </div>
  <div className="workspace-context" aria-label="Evidence context">
   <span className="workspace-source">{source}</span>
   <span className="workspace-timestamp"><AccessTimeOutlined aria-hidden="true"/>{readAt?<><span>Read <time dateTime={readAt}>{formatUTCDateTime(readAt)}</time> UTC</span></>:<span>Awaiting evidence</span>}</span>
   <Tooltip title="Control 9 is not assessed in the workshop evidence. A verdict cannot be established."><span className="workspace-assessment" tabIndex={0}><InfoOutlined aria-hidden="true"/>Control 9 · Not assessed</span></Tooltip>
  </div>
 </header>;
}
