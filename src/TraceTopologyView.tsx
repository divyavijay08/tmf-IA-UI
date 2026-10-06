import {useMemo,useState,type CSSProperties} from 'react';
import {Background,BackgroundVariant,Controls,Handle,MarkerType,MiniMap,Position,ReactFlow,type Node,type NodeProps} from '@xyflow/react';
import SmartToyOutlined from '@mui/icons-material/SmartToyOutlined';
import ApiOutlined from '@mui/icons-material/ApiOutlined';
import AutoAwesomeOutlined from '@mui/icons-material/AutoAwesomeOutlined';
import BuildOutlined from '@mui/icons-material/BuildOutlined';
import SyncOutlined from '@mui/icons-material/SyncOutlined';
import LanOutlined from '@mui/icons-material/LanOutlined';
import type {CloudSpan} from './cloudwatchData';
import type {TraceNode} from './traceHierarchy';
import {spanType} from './conversationEvidence';
import {traceTopology} from './traceTopology';
import '@xyflow/react/dist/style.css';

const kinds={
 'Agent invocation':{color:'#7c3aed',label:'Agent',Icon:SmartToyOutlined},
 'Agent cycle':{color:'#d97706',label:'Agent cycle',Icon:SyncOutlined},
 'Model request':{color:'#08916d',label:'Model',Icon:AutoAwesomeOutlined},
 'Tool call':{color:'#db2777',label:'Tool',Icon:BuildOutlined},
 'MCP request':{color:'#0891b2',label:'MCP',Icon:ApiOutlined},
 'Service request':{color:'#3874d6',label:'Service',Icon:LanOutlined},
};
type SpanNode=Node<{span:CloudSpan},'span'>;
function SpanTopologyNode({data,selected}:NodeProps<SpanNode>){
 const s=data.span,kind=kinds[spanType(s)],Icon=kind.Icon;
 return <div className="topology-node" data-selected={selected} style={{'--node-color':kind.color} as CSSProperties}>
  <Handle type="target" position={Position.Left} isConnectable={false}/>
  <div className="topology-node-type"><span className="topology-node-icon"><Icon/></span><span>{kind.label}</span>{selected&&<em>Selected</em>}</div>
  <strong title={s.name}>{s.name}</strong><small title={s.service}>{s.service||'Service not recorded'}</small>
  <div className="topology-node-meta"><span>{s.durationMs>=1000?`${(s.durationMs/1000).toFixed(2)} s`:`${s.durationMs.toFixed(1)} ms`}</span><span>{s.status?.toUpperCase()==='ERROR'?'Error':s.httpStatus?`HTTP ${s.httpStatus}`:s.inputTokens!=null?`${s.inputTokens.toLocaleString()} input tokens`:''}</span></div>
  <Handle type="source" position={Position.Right} isConnectable={false}/>
 </div>;
}
const nodeTypes={span:SpanTopologyNode};
export function TraceTopology({hierarchy,selected,onSelect}:{hierarchy:TraceNode[];selected?:string;onSelect:(id:string)=>void}){
 const [full,setFull]=useState(false);
 const graph=useMemo(()=>traceTopology(hierarchy,selected,full),[hierarchy,selected,full]);
 const nodes:SpanNode[]=graph.nodes.map(({node,position})=>({id:node.span.spanId,type:'span',data:{span:node.span},position,width:216,height:124,selected:node.span.spanId===selected,ariaLabel:`${node.span.name}, ${spanType(node.span)}, ${node.span.spanId}`,draggable:false,connectable:false,deletable:false}));
 const byId=new Map(graph.nodes.map(n=>[n.node.span.spanId,n.node]));
 const edges=graph.edges.map(e=>{const color=kinds[spanType(byId.get(e.target)!.span)].color;return {...e,id:`${e.source}-${e.target}`,type:'smoothstep',style:{stroke:color,strokeWidth:e.target===selected?2.5:1.7},markerEnd:{type:MarkerType.ArrowClosed,color,width:16,height:16},focusable:false,selectable:false,deletable:false};});
 // Remount only when the displayed topology changes, so normal selections preserve pan/zoom.
 const graphKey=nodes.map(n=>n.id).join('|');
 return <section className="wa-panel trace-trajectory"><header><div className="trace-panel-title"><h2>Agent trajectory</h2><small>Recorded span topology · {nodes.length} nodes · {edges.length} connections</small></div><div className="trace-switch" aria-label="Topology scope"><button aria-pressed={!full} onClick={()=>setFull(false)}>Selected branch</button><button aria-pressed={full} onClick={()=>setFull(true)}>Full trace</button></div></header>
 <div className="topology-legend">{Object.entries(kinds).map(([type,k])=><span key={type}><i style={{background:k.color}}/>{k.label}</span>)}</div>
 <div className="topology-canvas" aria-label="Interactive agent topology">{nodes.length?<ReactFlow<SpanNode> key={graphKey} nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodeClick={(_,n)=>onSelect(n.id)} fitView fitViewOptions={{padding:.22,maxZoom:1}} minZoom={.08} maxZoom={1.8} nodesDraggable={false} nodesConnectable={false} edgesReconnectable={false} deleteKeyCode={null} zoomOnScroll={false} zoomOnDoubleClick={false} preventScrolling={false}><Background variant={BackgroundVariant.Dots} gap={20} size={1}/><Controls showInteractive={false}/><MiniMap nodeColor={n=>kinds[spanType((n.data as SpanNode['data']).span)].color} pannable zoomable maskColor="rgba(120,135,160,.12)"/></ReactFlow>:<p className="topology-empty">Select a span to explore its connections.</p>}</div>
 <footer><span>Drag the canvas to pan. Use + / − to zoom. Select a node to inspect its details.</span><span>Arrows show recorded parent → child links.</span></footer></section>;
}
