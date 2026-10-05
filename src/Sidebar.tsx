import {Box,Button,Typography,Tooltip,Avatar,Divider} from '@mui/material';
import DashboardOutlined from '@mui/icons-material/DashboardOutlined';
import AccountTreeOutlined from '@mui/icons-material/AccountTreeOutlined';
import VerifiedUserOutlined from '@mui/icons-material/VerifiedUserOutlined';
import HubOutlined from '@mui/icons-material/HubOutlined';
import ReportProblemOutlined from '@mui/icons-material/ReportProblemOutlined';
import FactCheckOutlined from '@mui/icons-material/FactCheckOutlined';
import InsightsOutlined from '@mui/icons-material/InsightsOutlined';
import TimelineOutlined from '@mui/icons-material/TimelineOutlined';
import MonitorHeartOutlined from '@mui/icons-material/MonitorHeartOutlined';
import DnsOutlined from '@mui/icons-material/DnsOutlined';
import SmartToyOutlined from '@mui/icons-material/SmartToyOutlined';
import PlayCircleOutlined from '@mui/icons-material/PlayCircleOutlined';
import ManageSearchOutlined from '@mui/icons-material/ManageSearchOutlined';
import NotificationsOutlined from '@mui/icons-material/NotificationsOutlined';
import TerminalOutlined from '@mui/icons-material/TerminalOutlined';
export const navigationLabels:Record<string,string>={'Trust chain':'Run inspector','Overview':'Workspace overview','Agent runs':'Runs & executions','Observability':'CloudWatch & traces','Control register':'Controls & thresholds','Integrations':'Sources & ServiceNow','Findings & gaps':'Findings & response','Audit workspace':'Query & reproduce','Measured impact':'Outcomes & impact'};
const items=[{name:'Overview',icon:DashboardOutlined},{name:'Live monitor',icon:MonitorHeartOutlined},{name:'Foundation & runtime',icon:DnsOutlined},{name:'Agents & principals',icon:SmartToyOutlined},{name:'Agent runs',icon:PlayCircleOutlined},{name:'Evidence explorer',icon:ManageSearchOutlined},{name:'Observability',icon:TimelineOutlined},{name:'Trust chain',icon:AccountTreeOutlined},{name:'Control register',icon:VerifiedUserOutlined},{name:'Findings & gaps',icon:ReportProblemOutlined},{name:'Notifications & receipts',icon:NotificationsOutlined},{name:'Integrations',icon:HubOutlined},{name:'Evidence coverage',icon:FactCheckOutlined},{name:'Audit workspace',icon:TerminalOutlined},{name:'Measured impact',icon:InsightsOutlined}];
export default function Sidebar({collapsed=false,page,onNavigate,id}:{collapsed?:boolean;page:string;onNavigate:(page:string)=>void;id:string}){
 return <Box component="nav" id={id} aria-label="Workspace navigation" className={`sidebar ${collapsed?'is-collapsed':''}`} sx={{bgcolor:'background.paper',borderRight:1,borderColor:'divider'}}>
  <Box className="sidebar-links"><Typography className="nav-caption">{collapsed?'':'Workspace'}</Typography>{items.map(({name,icon:Icon})=><Tooltip key={name} title={collapsed?(navigationLabels[name]??name):''} placement="right"><Button className="nav-item" aria-label={navigationLabels[name]??name} aria-current={page===name?'page':undefined} onClick={()=>onNavigate(name)} sx={{color:page===name?'primary.main':'text.secondary',bgcolor:page===name?'var(--selected)':'transparent'}}><Icon/>{!collapsed&&<span className="sidebar-label">{navigationLabels[name]??name}</span>}</Button></Tooltip>)}</Box>
  <Box className="sidebar-footer"><Divider sx={{my:1.5}}/><Box className="sidebar-profile"><Tooltip title={collapsed?'Ashwath D · Workspace member':''} placement="right"><Avatar sx={{width:32,height:32,fontSize:12,bgcolor:'var(--selected)',color:'primary.main'}}>AD</Avatar></Tooltip>{!collapsed&&<Box className="sidebar-label"><Typography fontSize={12} fontWeight={600}>Ashwath D</Typography><Typography fontSize={11} color="text.secondary">Workspace member</Typography></Box>}</Box></Box>
 </Box>
}
