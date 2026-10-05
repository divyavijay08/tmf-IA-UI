import {useEffect,useRef,useState} from 'react';
import MicNoneRounded from '@mui/icons-material/MicNoneRounded';

type Recognition = {
 lang:string;continuous:boolean;interimResults:boolean;
 onresult:((event:{results:ArrayLike<ArrayLike<{transcript:string}>>})=>void)|null;
 onerror:((event:{error:string})=>void)|null;onend:(()=>void)|null;
 start:()=>void;stop:()=>void;abort:()=>void;
};
type VoiceWindow=Window & {SpeechRecognition?:new()=>Recognition;webkitSpeechRecognition?:new()=>Recognition};

export function VoiceInput({value,onChange,disabled}:{value:string;onChange:(value:string)=>void;disabled:boolean}){
 const [listening,setListening]=useState(false),[message,setMessage]=useState('');
 const recognition=useRef<Recognition|null>(null);
 const supported=!!((window as VoiceWindow).SpeechRecognition||(window as VoiceWindow).webkitSpeechRecognition);
 useEffect(()=>()=>{const active=recognition.current;if(active){active.onend=null;active.onresult=null;active.onerror=null;active.abort()}},[]);
 useEffect(()=>{if(disabled)recognition.current?.stop()},[disabled]);
 function toggle(){
  if(listening){recognition.current?.stop();return}
  const Constructor=(window as VoiceWindow).SpeechRecognition||(window as VoiceWindow).webkitSpeechRecognition;
  if(!Constructor)return;
  const active=new Constructor(),prefix=value.trim();recognition.current=active;
  active.lang='en-US';active.continuous=false;active.interimResults=true;
  active.onresult=event=>{const text=Array.from(event.results).map(result=>result[0]?.transcript||'').join(' ');onChange([prefix,text].filter(Boolean).join(' '))};
  active.onerror=event=>{setListening(false);setMessage(event.error==='not-allowed'?'Microphone access was denied. Allow it in your browser to dictate.':event.error==='no-speech'?'No speech detected. Try again.':'Voice input unavailable. Please type your message.')};
  active.onend=()=>{setListening(false);recognition.current=null};
  setMessage('');try{active.start();setListening(true)}catch{setListening(false);setMessage('Unable to start voice input. Please try again.')}
 }
 return <div className="chat-voice"><button type="button" className="chat-mic" aria-label={listening?'Stop voice input':'Start voice input'} aria-pressed={listening} title={!supported?'Voice input is not supported by this browser':listening?'Stop listening':'Dictate a message'} disabled={disabled||!supported} onClick={toggle}>{listening?<span className="voice-wave" aria-hidden="true">{[0,1,2,3,4].map(i=><i key={i}/>)}</span>:<MicNoneRounded/>}</button>{(listening||message)&&<span className="chat-voice-status" role="status">{listening?'Listening…':message}</span>}</div>;
}
