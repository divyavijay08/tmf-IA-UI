import type {TraceNode} from './traceHierarchy';

/** Lay out only recorded tree edges. Missing parents never become synthetic links. */
export function traceTopology(hierarchy:TraceNode[],selected?:string,full=false){
 const chosen=hierarchy.find(n=>n.span.spanId===selected);
 const context=new Set(chosen?[...chosen.ancestors,chosen.span.spanId,...chosen.children]:[]);
 const visible=hierarchy.filter(n=>full||context.has(n.span.spanId));
 const ids=new Set(visible.map(n=>n.span.spanId));
 const children=new Map<string,TraceNode[]>();
 const roots:TraceNode[]=[];
 const edges:{source:string;target:string}[]=[];
 for(const n of visible){const parent=n.ancestors.at(-1);if(parent&&ids.has(parent)){children.set(parent,[...(children.get(parent)||[]),n]);edges.push({source:parent,target:n.span.spanId});}else roots.push(n);}
 let nextLeaf=0;
 const positions=new Map<string,{x:number;y:number}>();
 function place(n:TraceNode,depth:number):number{
  const kids=children.get(n.span.spanId)||[];
  const ys=kids.map(k=>place(k,depth+1));
  const y=ys.length?(ys[0]+ys[ys.length-1])/2:nextLeaf++*156;
  positions.set(n.span.spanId,{x:depth*310,y});return y;
 }
 for(const root of roots){place(root,0);nextLeaf+=.45;}
 return {nodes:visible.map(n=>({node:n,position:positions.get(n.span.spanId)!})),edges};
}
