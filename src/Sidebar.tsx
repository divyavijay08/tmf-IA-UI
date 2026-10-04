import {Box,Button,Typography,Tooltip,Avatar,Divider} from '@mui/material';
import DashboardOutlined from '@mui/icons-material/DashboardOutlined';
import AccountTreeOutlined from '@mui/icons-material/AccountTreeOutlined';
import VerifiedUserOutlined from '@mui/icons-material/VerifiedUserOutlined';
import HubOutlined from '@mui/icons-material/HubOutlined';
import ReportProblemOutlined from '@mui/icons-material/ReportProblemOutlined';
import ScienceOutlined from '@mui/icons-material/ScienceOutlined';
import FactCheckOutlined from '@mui/icons-material/FactCheckOutlined';
import InsightsOutlined from '@mui/icons-material/InsightsOutlined';
import TimelineOutlined from '@mui/icons-material/TimelineOutlined';
const items=[{name:'Overview',icon:DashboardOutlined},{name:'Agent runs',icon:AccountTreeOutlined},{name:'Observability',icon:TimelineOutlined},{name:'Control register',icon:VerifiedUserOutlined},{name:'Integrations',icon:HubOutlined},{name:'Findings & gaps',icon:ReportProblemOutlined},{name:'Judging readiness',icon:FactCheckOutlined},{name:'Measured impact',icon:InsightsOutlined}];
export default function Sidebar({collapsed=false,page,onNavigate,id}:{collapsed?:boolean;page:string;onNavigate:(page:string)=>void;id:string}){
 return <Box component="nav" id={id} aria-label="Workspace navigation" className={`sidebar ${collapsed?'is-collapsed':''}`} sx={{bgcolor:'background.paper',borderRight:1,borderColor:'divider'}}>
  <Box className="sidebar-links"><Typography className="nav-caption">{collapsed?'':'Workspace'}</Typography>{items.map(({name,icon:Icon})=><Tooltip key={name} title={collapsed?name:''} placement="right"><Button className="nav-item" aria-label={name} aria-current={page===name?'page':undefined} onClick={()=>onNavigate(name)} sx={{color:page===name?'primary.main':'text.secondary',bgcolor:page===name?'var(--selected)':'transparent'}}><Icon/>{!collapsed&&<span className="sidebar-label">{name}</span>}</Button></Tooltip>)}</Box>
  <Box className="sidebar-footer"><Tooltip title={collapsed?'Sample environment · No live connections':''} placement="right"><Box className="sidebar-environment" tabIndex={collapsed?0:undefined} aria-label="Sample environment"><ScienceOutlined sx={{fontSize:19}}/>{!collapsed&&<Typography fontSize={11}>Sample environment</Typography>}</Box></Tooltip><Divider sx={{my:1.5}}/><Box className="sidebar-profile"><Tooltip title={collapsed?'Divya · Workspace member':''} placement="right"><Avatar sx={{width:32,height:32,fontSize:12,bgcolor:'var(--selected)',color:'primary.main'}}>DV</Avatar></Tooltip>{!collapsed&&<Box className="sidebar-label"><Typography fontSize={12} fontWeight={600}>Divya</Typography><Typography fontSize={11} color="text.secondary">Workspace member</Typography></Box>}</Box></Box>
 </Box>
}
