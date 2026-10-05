import {formatUTCDate,formatUTCDateTime} from './dateTime';
import {useId,useState,type MouseEvent} from 'react';
import {Button,IconButton,Popover} from '@mui/material';
import CalendarTodayOutlined from '@mui/icons-material/CalendarTodayOutlined';
import ChevronLeft from '@mui/icons-material/ChevronLeft';
import ChevronRight from '@mui/icons-material/ChevronRight';

type Props={label:string;prompt:string;value:string;disabled?:boolean;onChange:(value:string)=>void};
const pad=(value:number)=>String(value).padStart(2,'0');
const dateKey=(date:Date)=>`${date.getUTCFullYear()}-${pad(date.getUTCMonth()+1)}-${pad(date.getUTCDate())}`;
const formatDate=(value:string)=>formatUTCDateTime(value,false);

export function DateTimeField({label,prompt,value,disabled=false,onChange}:Props){
 const id=useId();
 const [anchor,setAnchor]=useState<HTMLButtonElement|null>(null);
 const [month,setMonth]=useState(()=>new Date());
 const [day,setDay]=useState('');
 const [hour,setHour]=useState('00');
 const [minute,setMinute]=useState('00');
 const year=month.getUTCFullYear(),monthIndex=month.getUTCMonth();
 const firstDay=new Date(Date.UTC(year,monthIndex,1)).getUTCDay();
 const daysInMonth=new Date(Date.UTC(year,monthIndex+1,0)).getUTCDate();
 const today=dateKey(new Date());
 const monthLabel=month.toLocaleDateString('en-GB',{month:'long',year:'numeric',timeZone:'UTC'});
 function open(event:MouseEvent<HTMLButtonElement>){
  const selected=value?new Date(`${value}Z`):new Date();
  setMonth(new Date(Date.UTC(selected.getUTCFullYear(),selected.getUTCMonth(),1)));
  setDay(value.slice(0,10));setHour(value.slice(11,13)||'00');setMinute(value.slice(14,16)||'00');
  setAnchor(event.currentTarget);
 }
 function close(){setAnchor(null)}
 function moveMonth(offset:number){setMonth(new Date(Date.UTC(year,monthIndex+offset,1)))}
 return <div className="wa-date-time-field">
  <span className="wa-date-time-label" id={`${id}-label`}>{label}</span>
  <button type="button" className={`wa-date-time-trigger ${value?'has-value':''}`} disabled={disabled} aria-label={label}
   aria-describedby={`${id}-value`} aria-haspopup="dialog" aria-expanded={!!anchor}
   aria-controls={anchor?`${id}-picker`:undefined} onClick={open}>
   <span id={`${id}-value`}>{value?formatDate(value):prompt}</span><CalendarTodayOutlined aria-hidden="true"/>
  </button>
  <Popover open={!!anchor} anchorEl={anchor} onClose={close}
   anchorOrigin={{vertical:'bottom',horizontal:'left'}} transformOrigin={{vertical:'top',horizontal:'left'}}
   slotProps={{paper:{id:`${id}-picker`,className:'wa-date-picker',role:'dialog','aria-label':`${label} — choose date and time`,sx:{mt:1}}}}>
   <div className="wa-date-picker-heading"><span>Select date & time</span><span className="wa-date-picker-zone">UTC</span></div>
   <div className="wa-date-picker-month">
    <IconButton size="small" aria-label="Previous month" onClick={()=>moveMonth(-1)}><ChevronLeft/></IconButton>
    <strong aria-live="polite">{monthLabel}</strong>
    <IconButton size="small" aria-label="Next month" onClick={()=>moveMonth(1)}><ChevronRight/></IconButton>
   </div>
   <div className="wa-date-picker-weekdays" aria-hidden="true">{['Su','Mo','Tu','We','Th','Fr','Sa'].map(d=><span key={d}>{d}</span>)}</div>
   <div className="wa-date-picker-days" role="group" aria-label="Choose date">
    {Array.from({length:42},(_,index)=>{
     const date=index-firstDay+1;
     if(date<1||date>daysInMonth)return <span key={index}/>;
     const dateValue=`${year}-${pad(monthIndex+1)}-${pad(date)}`;
     return <button key={index} type="button" className={dateValue===today?'is-today':''}
      aria-label={formatUTCDate(new Date(Date.UTC(year,monthIndex,date)))}
      aria-pressed={dateValue===day} aria-current={dateValue===today?'date':undefined}
      onClick={()=>setDay(dateValue)}>{date}</button>;
    })}
   </div>
   <div className="wa-date-picker-time"><span>Time <small>24-hour</small></span><div>
    <select aria-label="Hour (UTC)" value={hour} onChange={event=>setHour(event.target.value)}>{Array.from({length:24},(_,i)=><option key={i} value={pad(i)}>{pad(i)}</option>)}</select>
    <span aria-hidden="true">:</span>
    <select aria-label="Minute (UTC)" value={minute} onChange={event=>setMinute(event.target.value)}>{Array.from({length:60},(_,i)=><option key={i} value={pad(i)}>{pad(i)}</option>)}</select>
   </div></div>
   <div className="wa-date-picker-actions">
    <Button onClick={()=>{onChange('');close()}}>Clear</Button>
    <Button onClick={close}>Cancel</Button>
    <Button variant="contained" disabled={!day} onClick={()=>{onChange(`${day}T${hour}:${minute}`);close()}}>Apply</Button>
   </div>
  </Popover>
 </div>;
}
