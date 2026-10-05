import {Children,cloneElement,isValidElement,useEffect,useRef,useState,type CSSProperties,type ReactElement,type ReactNode} from 'react';
import {IconButton,TableBody} from '@mui/material';
import FirstPage from '@mui/icons-material/FirstPage';
import LastPage from '@mui/icons-material/LastPage';
import ChevronLeft from '@mui/icons-material/ChevronLeft';
import ChevronRight from '@mui/icons-material/ChevronRight';

type ElementProps={children?:ReactNode;'data-empty'?:boolean};
type Props={children:ReactNode;label:string;scrollClassName?:string;scrollStyle?:CSSProperties;resetKey?:string};
const element=(node:ReactNode):node is ReactElement<ElementProps>=>isValidElement<ElementProps>(node);

/** Shared wrapper for native and MUI tables; only the current page is mounted. */
export function PaginatedTable({children,label,scrollClassName='wa-table-wrap',scrollStyle,resetKey=''}:Props){
 const nodes=Children.toArray(children);
 const table=nodes.find(element);
 const tableChildren=table?Children.toArray(table.props.children):[];
 const body=tableChildren.find(node=>element(node)&&(node.type==='tbody'||node.type===TableBody)) as ReactElement<ElementProps>|undefined;
 const allRows=body?Children.toArray(body.props.children).filter(element):[];
 const rows=allRows.filter(row=>!row.props['data-empty']);
 const scope=JSON.stringify([resetKey,rows.map(row=>row.key)]);
 const [size,setSize]=useState(10);
 const [position,setPosition]=useState({scope,page:0});
 const scroller=useRef<HTMLDivElement>(null);
 // Reset as soon as a filter or data scope changes, including equally sized result sets.
 if(position.scope!==scope)setPosition({scope,page:0});
 const pages=Math.max(1,Math.ceil(rows.length/size));
 const page=position.scope===scope?Math.min(position.page,pages-1):0;
 const start=page*size,end=Math.min(start+size,rows.length);
 const changePage=(next:number)=>setPosition({scope,page:Math.max(0,Math.min(next,pages-1))});
 useEffect(()=>{scroller.current?.scrollTo({top:0})},[page,size,scope]);
 const pageRows=rows.length?rows.slice(start,end):allRows;
 const paginatedBody=body?cloneElement(body,undefined,pageRows):undefined;
 const paginatedTable=table?cloneElement(table,undefined,tableChildren.map(node=>node===body?paginatedBody:node)):null;
 return <div className="wa-paginated-table">
  <div className={scrollClassName} style={scrollStyle} ref={scroller}>
   {nodes.map(node=>node===table?paginatedTable:node)}
  </div>
  <nav className="wa-table-pagination" aria-label={`${label} pagination`}>
   <label className="wa-page-size">Rows per page
    <select aria-label={`${label} rows per page`} value={size} onChange={event=>{setSize(Number(event.target.value));changePage(0)}}>
     {[10,25,50,100].map(value=><option key={value} value={value}>{value}</option>)}
    </select>
   </label>
   <span className="wa-page-range" aria-live="polite">{rows.length?`${(start+1).toLocaleString()}–${end.toLocaleString()}`:'0'} of {rows.length.toLocaleString()}</span>
   <span className="wa-page-number">Page {page+1} of {pages}</span>
   <div className="wa-page-buttons">
    <IconButton size="small" aria-label={`${label}: first page`} disabled={page===0} onClick={()=>changePage(0)}><FirstPage/></IconButton>
    <IconButton size="small" aria-label={`${label}: previous page`} disabled={page===0} onClick={()=>changePage(page-1)}><ChevronLeft/></IconButton>
    <IconButton size="small" aria-label={`${label}: next page`} disabled={page===pages-1} onClick={()=>changePage(page+1)}><ChevronRight/></IconButton>
    <IconButton size="small" aria-label={`${label}: last page`} disabled={page===pages-1} onClick={()=>changePage(pages-1)}><LastPage/></IconButton>
   </div>
  </nav>
 </div>;
}
