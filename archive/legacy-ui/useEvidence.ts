import {useCallback,useEffect,useRef,useState} from 'react';
import {sampleApi,type Snapshot} from './evidenceApi';
export function useEvidence(){
 const [snapshot,setSnapshot]=useState<Snapshot|null>(null),[paused,setPaused]=useState(false),[error,setError]=useState<string|null>(null),[loading,setLoading]=useState(false),[now,setNow]=useState(Date.now());
 const active=useRef<AbortController|null>(null);
 const refresh=useCallback(async()=>{active.current?.abort();const request=new AbortController();active.current=request;setLoading(true);try{const next=await sampleApi.getSnapshot(request.signal);if(!request.signal.aborted){setSnapshot(next);setError(null)}}catch(e){if(!request.signal.aborted)setError(e instanceof Error?e.message:'Unable to refresh evidence')}finally{if(!request.signal.aborted)setLoading(false)}},[]);
 useEffect(()=>{refresh();return()=>active.current?.abort()},[refresh]);
 useEffect(()=>{if(paused)return;const timer=setInterval(refresh,15000);return()=>clearInterval(timer)},[paused,refresh]);
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer)},[]);
 return {snapshot,paused,setPaused,error,loading,refresh,stale:!!snapshot&&now-Date.parse(snapshot.receivedAt)>45000};
}
