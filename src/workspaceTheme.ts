import {createTheme} from '@mui/material/styles';
import {typography,typographyComponents} from './typography';

// Neutral surfaces from ving-ui; retain Alpha's original blue primary color.
export const darkPalette={
 frame:'#1b1c1e',base:'#0f0f0f',panel:'#171717',surface:'#1b1c1e',raised:'#212121',
 elevated:'#292a2d',input:'#191919',border:'#34373d',borderStrong:'#51545b',
 text:'#f1f3f4',secondary:'#bdc1c6',muted:'#a8adb4',accent:'#8ab4f8',accentHover:'#aecbfa',onAccent:'#202124',
 hover:'rgba(138,180,248,0.12)',selection:'rgba(138,180,248,0.14)',focus:'rgba(138,180,248,0.28)',
 success:'#81c995',warning:'#fdd663',danger:'#f28b82',info:'#8ab4f8',
};
const c=darkPalette;
const darkTokens={
 colorScheme:'dark','--frame':c.frame,'--bg':c.base,'--panel':c.panel,'--surface':c.surface,
 '--raised':c.raised,'--elevated':c.elevated,'--input':c.input,'--text':c.text,'--muted':c.secondary,
 '--text-subtle':c.muted,'--border':c.border,'--border-strong':c.borderStrong,
 '--primary':c.accent,'--primary-hover':c.accentHover,'--on-primary':c.onAccent,
 '--selected':c.selection,'--hover':c.hover,'--focus':c.focus,
 '--status-pass':c.success,'--status-pass-bg':'rgba(129,201,149,0.1)',
 '--status-breach':c.danger,'--status-breach-bg':'rgba(242,139,130,0.1)',
 '--status-unknown':c.warning,'--status-unknown-bg':'rgba(253,214,99,0.1)',
 '--status-incomplete':c.warning,'--status-incomplete-bg':'rgba(253,214,99,0.1)',
 '--chart-failure':c.danger,'--chart-agent':c.accent,'--chart-model':c.info,'--chart-tool':c.success,
 '--chart-authorization':c.warning,'--chart-budget':'#f472b6','--chart-notification':'#fb923c',
};

export function createWorkspaceTheme(dark:boolean){
 return createTheme({
  palette:{mode:dark?'dark':'light',
   primary:{main:dark?c.accent:'#2378e8',contrastText:dark?c.onAccent:'#fff'},
   background:{default:dark?c.base:'#f8faff',paper:dark?c.surface:'#fff'},
   text:{primary:dark?c.text:'#243247',secondary:dark?c.secondary:'#617087',disabled:dark?c.muted:undefined},
   divider:dark?c.border:'#e4eaf2',
   ...(dark?{success:{main:c.success},warning:{main:c.warning},error:{main:c.danger},info:{main:c.info},
    action:{hover:c.hover,selected:c.selection,focus:c.focus,disabledBackground:'rgba(255,255,255,0.06)'}}:{}),
  },
  typography,shape:{borderRadius:6},
  components:{
   ...typographyComponents,
   MuiCssBaseline:{styleOverrides:{'html[data-theme="dark"], html[data-theme="dark"] .wa-app':darkTokens}},
   MuiButton:{...typographyComponents.MuiButton,defaultProps:{disableElevation:true,size:'small'},
    ...(dark?{styleOverrides:{root:{fontSize:'0.8125rem',fontWeight:600,lineHeight:'20px'},
     containedPrimary:{backgroundColor:c.accent,color:c.onAccent,'&:hover':{backgroundColor:c.accentHover}},
     outlined:{borderColor:c.border,color:c.text,'&:hover':{borderColor:c.accent,backgroundColor:c.hover,color:c.accent}},
    }}:{}),
   },
   MuiTextField:{defaultProps:{size:'small'}},
   MuiPaper:{defaultProps:{elevation:0},styleOverrides:{root:{backgroundImage:'none'}}},
   ...(dark?{
    MuiOutlinedInput:{styleOverrides:{root:{backgroundColor:c.input,
     '& .MuiOutlinedInput-notchedOutline':{borderColor:c.border},
     '&:hover .MuiOutlinedInput-notchedOutline':{borderColor:c.borderStrong},
     '&.Mui-focused .MuiOutlinedInput-notchedOutline':{borderColor:c.accent},
    }}},
    MuiMenu:{styleOverrides:{paper:{backgroundColor:c.elevated,border:`1px solid ${c.border}`}}},
    MuiDrawer:{styleOverrides:{paper:{backgroundColor:c.panel}}},
    MuiDialog:{styleOverrides:{paper:{backgroundColor:c.elevated}}},
    MuiTooltip:{styleOverrides:{tooltip:{fontSize:'0.8125rem',lineHeight:1.45,backgroundColor:c.elevated,color:c.text,border:`1px solid ${c.borderStrong}`}}},
   }:{}),
  },
 });
}
