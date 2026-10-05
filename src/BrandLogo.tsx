import {useId} from 'react';

/** Render the original mark with its white backdrop removed, in either theme. */
export function BrandLogo(){
 const filterId=useId();
 const logoUrl='./brand/team-logos.png';
 return <svg className="wa-alpha-logo" viewBox="1329 12 186 195" role="img" aria-label="Team Alpha logo">
  <defs><filter id={filterId} colorInterpolationFilters="sRGB" x="0" y="0" width="100%" height="100%">
   <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  -1 -1 -1 0 3"/>
  </filter></defs>
  <image href={logoUrl} width="2328" height="1086" filter={`url(#${filterId})`}/>
 </svg>;
}
