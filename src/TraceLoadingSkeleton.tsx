/** Match the trace layout while CloudWatch evidence is being retrieved. */
export function TraceLoadingSkeleton(){
 const line=(width:string,height=12)=><span className="trace-skeleton-line" style={{width,height}}/>;
 return <section className="trace-loading" aria-label="Loading trace and controls" aria-busy="true">
  <div className="trace-loading-caption">Loading trace and control evidence…</div>
  <div aria-hidden="true">
   <div className="trace-skeleton-toolbar">{line('180px',36)}{line('260px')}</div>
   <div className="trace-skeleton-grid">
    <div className="trace-skeleton-panel"><div className="trace-skeleton-header">{line('115px',18)}{line('120px',30)}</div><div className="trace-skeleton-table">{[0,1,2,3,4,5].map(i=><div className="trace-skeleton-row" key={i}><div style={{paddingLeft:(i%3)*12}}>{line(`${80-i%3*12}%`)}{line('58%',9)}</div>{line(`${45+i%3*18}%`,10)}{line('42px',10)}</div>)}</div></div>
    <div className="trace-skeleton-panel"><div className="trace-skeleton-header">{line('145px',18)}{line('85px',30)}</div><div className="trace-skeleton-metrics">{[0,1,2].map(i=><div key={i}>{line('70%',10)}{line('60%',24)}</div>)}</div><div className="trace-skeleton-details">{[0,1,2,3,4].map(i=><div key={i}>{line('85px',11)}{line(`${65-i%3*12}%`,12)}</div>)}</div></div>
   </div>
   <div className="trace-skeleton-panel trace-skeleton-topology"><div className="trace-skeleton-header">{line('140px',18)}{line('165px',30)}</div><div className="trace-skeleton-nodes">{[0,1,2].map(i=><div key={i}>{line('70%',12)}{line('90%',10)}{line('50%',9)}</div>)}</div></div>
   <div className="trace-skeleton-panel"><div className="trace-skeleton-header">{line('150px',18)}{line('110px',12)}</div><div className="trace-skeleton-controls">{[0,1,2].map(i=><div key={i}>{line('75%',16)}{line('95%')}{line('85%')}{line('65%')}</div>)}</div></div>
  </div>
 </section>;
}
