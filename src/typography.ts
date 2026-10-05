import type {ThemeOptions} from '@mui/material/styles';

// Matches ving-ui/src/theme/vingTheme.js and its shared control/table sizing.
export const fontFamily = '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

export const typography: ThemeOptions['typography'] = {
  fontFamily,
  h1: {fontSize:'clamp(1.75rem, 1.25rem + 2vw, 2.25rem)',fontWeight:500,letterSpacing:'-0.025em',lineHeight:1.2},
  h2: {fontSize:'1.75rem',fontWeight:500,letterSpacing:'-0.02em',lineHeight:1.25},
  h3: {fontSize:'1.5rem',fontWeight:500,letterSpacing:'-0.015em',lineHeight:1.3},
  h4: {fontSize:'1.25rem',fontWeight:600,letterSpacing:'-0.01em',lineHeight:1.4},
  h5: {fontSize:'1.125rem',fontWeight:600,lineHeight:1.4},
  h6: {fontSize:'1rem',fontWeight:600,lineHeight:1.5},
  subtitle1: {fontSize:'1rem',fontWeight:500,lineHeight:1.5},
  subtitle2: {fontSize:'0.875rem',fontWeight:500,lineHeight:1.5},
  body1: {fontSize:'0.9375rem',lineHeight:1.6},
  body2: {fontSize:'0.875rem',lineHeight:1.5},
  caption: {fontSize:'0.8125rem',lineHeight:1.45},
  button: {fontSize:'0.875rem',textTransform:'none',fontWeight:500,letterSpacing:0},
  overline: {fontSize:'0.75rem',fontWeight:600,letterSpacing:'0.06em',lineHeight:1.5},
};

export const typographyComponents: NonNullable<ThemeOptions['components']> = {
  MuiButton: {styleOverrides:{root:{fontSize:'0.8125rem',fontWeight:600,lineHeight:'20px'}}},
  MuiInputBase: {styleOverrides:{root:{fontSize:'0.9375rem'}}},
  MuiInputLabel: {styleOverrides:{root:{fontSize:'0.875rem'}}},
  MuiTableCell: {styleOverrides:{root:{fontSize:'0.8125rem',lineHeight:1.5},head:{fontSize:'0.75rem',fontWeight:600}}},
  MuiTooltip: {styleOverrides:{tooltip:{fontSize:'0.8125rem',lineHeight:1.45}}},
  MuiChip: {styleOverrides:{root:{fontSize:'0.8125rem'}}},
};
