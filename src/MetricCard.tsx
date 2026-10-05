import PlayCircleOutline from '@mui/icons-material/PlayCircleOutline';
import StorageOutlined from '@mui/icons-material/StorageOutlined';
import VerifiedUserOutlined from '@mui/icons-material/VerifiedUserOutlined';
import ReportProblemOutlined from '@mui/icons-material/ReportProblemOutlined';
import AutoAwesomeOutlined from '@mui/icons-material/AutoAwesomeOutlined';
import TrendingUpOutlined from '@mui/icons-material/TrendingUpOutlined';
import AccountBalanceWalletOutlined from '@mui/icons-material/AccountBalanceWalletOutlined';
import NotificationsOutlined from '@mui/icons-material/NotificationsOutlined';

const icons={runs:PlayCircleOutline,records:StorageOutlined,verified:VerifiedUserOutlined,failures:ReportProblemOutlined,model:AutoAwesomeOutlined,impact:TrendingUpOutlined,budget:AccountBalanceWalletOutlined,notification:NotificationsOutlined};
export type MetricIcon=keyof typeof icons;

export function MetricCard({label,value,icon}:{label:string;value:string|number;icon:MetricIcon}){
 const Icon=icons[icon];
 const isNumber=typeof value==='number'||/^[\d,]+$/.test(value);
 return <div className="wa-metric-card">
  <div className="wa-metric-heading"><span>{label}</span><span className="wa-metric-icon" aria-hidden="true"><Icon/></span></div>
  <b className={isNumber?'wa-metric-value':'wa-metric-value is-text'}>{typeof value==='number'?value.toLocaleString():value}</b>
 </div>;
}
