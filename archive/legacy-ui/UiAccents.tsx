import {Checkbox} from '@mui/material';
// Uiverse adaptations; attribution and MIT terms in THIRD_PARTY_NOTICES.txt.
export function EvidenceCheckbox({checked,onChange,label}:{checked:boolean;onChange:()=>void;label:string}){
 const icon=(active:boolean)=><svg className={`stroke-checkbox ${active?'checked':''}`} viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><rect x="1.5" y="1.5" width="21" height="21" rx="5" ry="5" strokeWidth="2"/><polyline points="7 10 12 16 22 2" strokeWidth="3"/></g></svg>;
 return <Checkbox checked={checked} onChange={onChange} inputProps={{'aria-label':label}} icon={icon(false)} checkedIcon={icon(true)} size="small"/>;
}
export function ThemeToggle({dark,onChange}:{dark:boolean;onChange:()=>void}){return <label className="theme-switch"><input type="checkbox" aria-label="Light appearance" checked={!dark} onChange={onChange}/><span className="theme-slider"><span className="theme-star star-1"/><span className="theme-star star-2"/><span className="theme-star star-3"/><span className="theme-cloud"/></span></label>}
